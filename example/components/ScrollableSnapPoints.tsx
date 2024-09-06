import React, { useState, useRef, useEffect, useCallback } from 'react';
import { styled } from 'styled-components';
import { Sheet, type SheetRef } from './sheet';

import { Button } from './common';

const MIN_HEIGHT = 0.3;
const snapPoints = [-0.001, 0.3, 0.1, MIN_HEIGHT];
const initialSnap = 1;
const DRAG_THRESHOLD = 1; // 드래그로 인식할 최소 이동 거리

export function ScrollableSnapPoints() {
  const ref = useRef<SheetRef>();
  const scrollerRef = useRef<HTMLDivElement>(null);
  // const [isOpen, setOpen] = useState(false);
  const [yPosition, setYPosition] = useState(0);
  const [currentSnapIndex, setCurrentSnapIndex] = useState(initialSnap);
  const [isDraggable, setIsDraggable] = useState(false);
  const touchStartRef = useRef(0);
  const previousTouchRef = useRef(0);

  const handleSnap = (index: number) => {
    // console.log(`Snapped to index ${index}`);
    setCurrentSnapIndex(index);
    const estimatedY =
      typeof snapPoints[index] === 'number'
        ? snapPoints[index]
        : window.innerHeight * (snapPoints[index] as number);
    setYPosition(estimatedY as number);
    setIsDraggable(false);
    if (scrollerRef.current && index > 0) {
      scrollerRef.current.scrollTop = 0;
    }
  };

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const initialTouch = e.touches[0].pageY;
    touchStartRef.current = initialTouch;
    previousTouchRef.current = initialTouch;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (scrollerRef.current) {
        const { scrollTop } = scrollerRef.current;
        const currentY = e.touches[0].pageY;
        const movementY = currentY - previousTouchRef.current;
        if (currentSnapIndex === 0) {
          if (scrollTop === 0 && movementY > DRAG_THRESHOLD) {
            // 위로 무브 (손가락을 아래로 움직임)
            setIsDraggable(true);
            e.preventDefault(); // 기본 스크롤 동작 방지
          } else if (movementY < -DRAG_THRESHOLD && !isDraggable) {
            // 아래로 무브 (손가락을 위로 움직임)
            setIsDraggable(false);
          }
        }
        // 현재 터치 위치를 이전 터치 위치로 업데이트
        previousTouchRef.current = currentY;
      }
    },
    [currentSnapIndex, isDraggable]
  );

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.addEventListener('touchstart', handleTouchStart);
      scroller.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      });
    }

    return () => {
      if (scroller) {
        scroller.removeEventListener('touchstart', handleTouchStart);
        scroller.removeEventListener('touchmove', handleTouchMove);
      }
    };
  }, [handleTouchStart, handleTouchMove]);

  const snapTo = (i: number) => ref.current?.snapTo(i);
  const handleClose = () => {
    snapTo(snapPoints.length - 1);
  };

  return (
    <>
      <Button onClick={open}>Scrollable + Snap points</Button>

      <Sheet
        ref={ref}
        isOpen={true}
        onClose={handleClose}
        snapPoints={snapPoints}
        initialSnap={initialSnap}
        onSnap={handleSnap}
        detent="content-height"
      >
        <FullHeightContainer>
          <Sheet.Header />

          <DraggableContent isDraggable={isDraggable || currentSnapIndex !== 0}>
            <ScrollableContent
              ref={scrollerRef}
              isScrollable={currentSnapIndex === 0}
              draggableAt="both"
            >
              <BoxList>
                <div>Current Y position: {yPosition.toFixed(2)}px</div>
                {/* <Controls>
                  <Button onClick={() => snapTo(0)}>Snap to top</Button>
                  <Button onClick={() => snapTo(1)}>Snap to 50%</Button>
                  <Button onClick={() => snapTo(2)}>Snap to 0</Button>
                  <Button onClick={() => snapTo(3)}>Snap to close</Button>
                </Controls> */}

                {Array.from({ length: 20 })
                  .fill(1)
                  .map((_, i) => (
                    <Box key={i}>{i + 1}</Box>
                  ))}
              </BoxList>
            </ScrollableContent>
          </DraggableContent>
        </FullHeightContainer>
      </Sheet>
    </>
  );
}

const FullHeightContainer = styled(Sheet.Container)`
  && {
    max-height: min(
      100%,
      calc(100% - env(safe-area-inset-top) - 0px)
    ) !important;

    box-shadow: none !important;
  }
`;

const DraggableContent = styled(Sheet.Content)<{ isDraggable: boolean }>`
  touch-action: ${(props) => (props.isDraggable ? 'none' : 'auto')};
`;

const ScrollableContent = styled(Sheet.Scroller)<{ isScrollable: boolean }>`
  overflow-y: ${(props) => (props.isScrollable ? 'auto' : 'hidden')} !important;
  height: 100%;
  touch-action: ${(props) => (props.isScrollable ? 'pan-y' : 'none')};
`;

const BoxList = styled.div`
  display: flex;
  flex-direction: column;
  padding: 16px;
  padding-top: 0px;
`;

const Box = styled.div`
  background-color: #eee;
  border-radius: 12px;
  min-height: 200px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 24px;

  &:last-of-type {
    margin-bottom: 0px;
  }
`;
