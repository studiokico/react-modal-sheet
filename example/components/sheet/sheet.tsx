import React, {
  Children,
  cloneElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { createPortal } from 'react-dom';

import {
  animate,
  AnimatePresence,
  motion,
  type PanInfo,
  type Transition,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';

import {
  useModalEffect,
  useDimensions,
  useIsomorphicLayoutEffect,
  useEffectEvent,
} from './hooks';

import {
  REDUCED_MOTION_TWEEN_CONFIG,
  DEFAULT_TWEEN_CONFIG,
  DRAG_CLOSE_THRESHOLD,
  DRAG_VELOCITY_THRESHOLD,
  IS_SSR,
} from './constants';

import { type SheetContextType, type SheetProps } from './types';
import { SheetScrollerContextProvider, SheetContext } from './context';
import {
  getClosest,
  inDescendingOrder,
  removeDuplicatesAndSmallest,
  validateSnapTo,
} from './utils';
import { usePreventScroll } from './use-prevent-scroll';
import styles from './styles';

const Sheet = forwardRef<any, SheetProps>(
  (
    {
      onOpenStart,
      onOpenEnd,
      onClose,
      onCloseStart,
      onCloseEnd,
      onSnap,
      children,
      disableScrollLocking = false,
      isOpen,
      snapPoints,
      rootId,
      mountPoint,
      style,
      detent = 'full-height',
      initialSnap = 0,
      disableDrag = false,
      prefersReducedMotion = true,
      tweenConfig = DEFAULT_TWEEN_CONFIG,
      ...rest
    },
    ref
  ) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const indicatorRotation = useMotionValue(0);
    const { height: windowHeight } = useDimensions();
    const shouldReduceMotion = useReducedMotion();
    const reduceMotion = Boolean(prefersReducedMotion || shouldReduceMotion);
    const animationOptions: Transition = {
      type: 'tween',
      ...(reduceMotion ? REDUCED_MOTION_TWEEN_CONFIG : tweenConfig),
    };

    // NOTE: the inital value for `y` doesn't matter since it is overwritten by
    // the value driven by the `AnimatePresence` component when the sheet is opened
    // and after that it is driven by the gestures and/or snapping
    const y = useMotionValue(0);

    // +2 for tolerance in case the animated value is slightly off
    const zIndex = useTransform(y, (value) =>
      value + 2 >= windowHeight ? -1 : 9999999
    );
    const visibility = useTransform(y, (value) =>
      value + 2 >= windowHeight ? 'hidden' : 'visible'
    );

    // Keep the callback fns up-to-date so that they can be accessed inside
    // the effect without including them to the dependencies array
    const callbacks = useRef({
      onOpenStart,
      onOpenEnd,
      onCloseStart,
      onCloseEnd,
    });

    useIsomorphicLayoutEffect(() => {
      callbacks.current = {
        onOpenStart,
        onOpenEnd,
        onCloseStart,
        onCloseEnd,
      };
    });

    if (snapPoints) {
      // Convert negative / percentage snap points to absolute values
      snapPoints = snapPoints.map((point) => {
        // Percentage values e.g. between 0.0 and 1.0
        if (point > 0 && point <= 1) return Math.round(point * windowHeight);
        return point < 0 ? windowHeight + point : point; // negative values
      });

      console.assert(
        inDescendingOrder(snapPoints) || windowHeight === 0,
        `Snap points need to be in descending order got: [${snapPoints.join(
          ', '
        )}]`
      );
    }

    const onDrag = useEffectEvent((_, { delta }: PanInfo) => {
      // Update drag indicator rotation based on drag velocity
      const velocity = y.getVelocity();

      if (velocity > 0) indicatorRotation.set(1);
      if (velocity < 0) indicatorRotation.set(-1);

      // Make sure user cannot drag beyond the top of the sheet
      y.set(Math.max(y.get() + delta.y, 0));
    });

    const onDragStart = useEffectEvent(() => {
      // Find focused input inside the sheet and blur it when dragging starts
      // to prevent a weird ghost caret "bug" on mobile
      const focusedElement = document.activeElement as HTMLElement | null;
      if (!focusedElement || !sheetRef.current) return;

      const isInput =
        focusedElement.tagName === 'INPUT' ||
        focusedElement.tagName === 'TEXTAREA';

      // Only blur the focused element if it's inside the sheet
      if (isInput && sheetRef.current.contains(focusedElement)) {
        focusedElement.blur();
      }
    });

    const onDragEnd = useEffectEvent((_, { velocity }: PanInfo) => {
      const sheetHeight = sheetRef.current!.getBoundingClientRect().height;
      const currentY = y.get();
      let snapIndex = 0;

      let snapTo = 0;

      if (snapPoints) {
        const snapToValues = removeDuplicatesAndSmallest(
          snapPoints.map((p) => sheetHeight - Math.min(p, sheetHeight))
        );

        // Allow snapping to the top of the sheet if detent is set to `content-height`
        if (detent === 'content-height' && !snapToValues.includes(0)) {
          snapToValues.unshift(0);
        }

        // 현재 스냅 포인트를 찾음
        snapTo = getClosest(snapToValues, currentY);
        snapIndex = snapToValues.indexOf(snapTo);

        // velocity.y > 0: 아래로 드래그, velocity.y < 0: 위로 드래그
        if (Math.abs(velocity.y) > DRAG_VELOCITY_THRESHOLD) {
          if (velocity.y > 0) {
            // 아래로 드래그: 스냅 인덱스 증가 (최대 인덱스를 넘지 않게)
            snapIndex = Math.min(snapIndex + 1, snapToValues.length - 1);
          } else {
            // 위로 드래그: 스냅 인덱스 감소 (최소 인덱스를 넘지 않게)
            snapIndex = Math.max(snapIndex - 1, 0);
          }
          snapTo = snapToValues[snapIndex];
        }

        console.log('Snap Index:', snapIndex); // snapIndex 출력
      } else {
        // Always move to closest snap point regardless of velocity or drag distance
        snapTo = sheetHeight * 0.5;
      }

      snapTo = validateSnapTo({ snapTo, sheetHeight });

      // 애니메이션 없이 즉시 위치 변경
      void animate(y, snapTo, animationOptions);

      if (snapPoints && onSnap) {
        const snapValue = Math.abs(Math.round(snapPoints[0] - snapTo));
        const snapIndex = snapPoints.indexOf(
          getClosest(snapPoints, snapValue)
        ); // 민감도를 1로 설정
        onSnap(snapIndex);
      }

      const roundedSheetHeight = Math.round(sheetHeight);
      const shouldClose = snapTo + 2 >= roundedSheetHeight; // 2px tolerance

      if (shouldClose) onClose();

      // Reset indicator rotation after dragging
      indicatorRotation.set(0);
    });

    // Trigger onSnap callback when sheet is opened or closed
    useEffect(() => {
      if (!snapPoints || !onSnap) return;
      const snapIndex = isOpen ? initialSnap : snapPoints.length - 1;
      onSnap(snapIndex);
    }, [isOpen]); // eslint-disable-line

    useImperativeHandle(ref, () => ({
      y,
      snapTo: (snapIndex: number) => {
        const sheetEl = sheetRef.current;

        if (snapPoints?.[snapIndex] !== undefined && sheetEl) {
          const sheetHeight = sheetEl.getBoundingClientRect().height;
          const snapPoint = snapPoints[snapIndex];
          const snapTo = validateSnapTo({
            snapTo: sheetHeight - snapPoint,
            sheetHeight,
          });

          // void animate(y, snapTo, animationOptions);
          // 애니메이션 없이 즉시 위치 변경
          y.set(snapTo);
          if (onSnap) onSnap(snapIndex);
          if (snapTo >= sheetHeight) onClose();
        }
      },
    }));

    useModalEffect(isOpen, rootId);

    // Framer Motion should handle body scroll locking but it's not working
    // properly on iOS. Scroll locking from React Aria seems to work much better.
    usePreventScroll({ isDisabled: disableScrollLocking || !isOpen });

    const dragProps = useMemo(() => {
      const dragProps: SheetContextType['dragProps'] = {
        drag: 'y',
        dragElastic: 0,
        dragMomentum: false,
        dragPropagation: false,
        onDrag,
        onDragStart,
        onDragEnd,
      };

      return disableDrag ? undefined : dragProps;
    }, [disableDrag, windowHeight]); // eslint-disable-line

    const context: SheetContextType = {
      y,
      sheetRef,
      isOpen,
      initialSnap,
      snapPoints,
      detent,
      indicatorRotation,
      callbacks,
      dragProps,
      windowHeight,
      animationOptions,
      reduceMotion,
      disableDrag,
    };

    const sheet = (
      <SheetContext.Provider value={context}>
        <motion.div
          {...rest}
          ref={ref}
          style={{ ...styles.wrapper, zIndex, visibility, ...style }}
        >
          <AnimatePresence>
            {/* NOTE: AnimatePresence requires us to set keys to children */}
            {isOpen ? (
              <SheetScrollerContextProvider>
                {Children.map(children, (child: any, i) =>
                  cloneElement(child, { key: `sheet-child-${i}` })
                )}
              </SheetScrollerContextProvider>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </SheetContext.Provider>
    );

    if (IS_SSR) return sheet;

    return createPortal(sheet, mountPoint ?? document.body);
  }
);

Sheet.displayName = 'Sheet';

export default Sheet;
