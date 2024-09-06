export const MAX_HEIGHT = 'calc(100% - env(safe-area-inset-top) - 34px)';

export const IS_SSR = typeof window === 'undefined';

export const DEFAULT_TWEEN_CONFIG = {
  ease: 'easeOut',
  duration: 0.05,
};

export const REDUCED_MOTION_TWEEN_CONFIG = {
  ease: 'linear',
  duration: 0.1,
};

export const NO_TWEEN_CONFIG = {
  ease: (t: number) => t, // 선형 이징 (사실상 이징 없음)
  duration: 0, // 지속 시간 0으로 설정
};

// 조정된 값들
export const DRAG_CLOSE_THRESHOLD = 0.4; // sheet가 닫히는 임계치를 낮춤
export const DRAG_VELOCITY_THRESHOLD = 40; // 드래그 속도 임계치를 낮춤
