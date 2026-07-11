// Pure math for the card-deck swipe gesture. Kept free of DOM/React so the
// thresholds and commit rules are unit-testable in isolation.

export type SwipeDirection = 'left' | 'right' | 'up';
export type SwipeAxis = 'undecided' | 'horizontal' | 'vertical';

/** Pointer travel before the gesture is claimed as horizontal or released as vertical. */
export const AXIS_LOCK_DISTANCE = 12;
/** |dx| must beat |dy| by this factor to claim the gesture; otherwise scroll wins. */
export const HORIZONTAL_DOMINANCE = 1.2;
/** Release past this fraction of the card width commits the swipe. */
export const COMMIT_DISTANCE_RATIO = 0.35;
/** A flick commits with less travel when it's fast enough in the same direction. */
export const FLICK_MIN_DISTANCE = 40;
export const FLICK_MIN_VELOCITY = 0.6; // px/ms
export const MAX_DRAG_ROTATION_DEG = 10;
/** jsdom and pre-layout nodes report zero width; keep the math sane. */
export const FALLBACK_CARD_WIDTH = 320;
export const FALLBACK_CARD_HEIGHT = 480;
/** Cards are tall, so the up-swipe commits at a smaller fraction of the height. */
export const UP_COMMIT_DISTANCE_RATIO = 0.25;

export function resolveSwipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_DISTANCE) return 'undecided';
  return Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE ? 'horizontal' : 'vertical';
}

export function getSwipeCommitDirection(
  dx: number,
  velocityX: number,
  cardWidth: number
): SwipeDirection | null {
  const width = cardWidth || FALLBACK_CARD_WIDTH;
  const distanceCommit = Math.abs(dx) > width * COMMIT_DISTANCE_RATIO;
  const flickCommit =
    Math.abs(dx) > FLICK_MIN_DISTANCE &&
    Math.abs(velocityX) > FLICK_MIN_VELOCITY &&
    Math.sign(velocityX) === Math.sign(dx);
  if (!distanceCommit && !flickCommit) return null;
  return dx > 0 ? 'right' : 'left';
}

/** Up-swipe ("really known") commit: dy/velocityY are negative when moving up. */
export function getUpSwipeCommit(
  dy: number,
  velocityY: number,
  cardHeight: number
): 'up' | null {
  const height = cardHeight || FALLBACK_CARD_HEIGHT;
  const distanceCommit = -dy > height * UP_COMMIT_DISTANCE_RATIO;
  const flickCommit = -dy > FLICK_MIN_DISTANCE && -velocityY > FLICK_MIN_VELOCITY;
  return distanceCommit || flickCommit ? 'up' : null;
}

export function getUpSwipeVisuals(dy: number, cardHeight: number): { badgeOpacity: number } {
  const height = cardHeight || FALLBACK_CARD_HEIGHT;
  return {
    badgeOpacity: Math.min(1, Math.max(0, -dy) / (height * UP_COMMIT_DISTANCE_RATIO)),
  };
}

export function getSwipeVisuals(
  dx: number,
  cardWidth: number
): { rotationDeg: number; badgeOpacity: number; direction: SwipeDirection } {
  const width = cardWidth || FALLBACK_CARD_WIDTH;
  const rotationDeg = Math.max(
    -MAX_DRAG_ROTATION_DEG,
    Math.min(MAX_DRAG_ROTATION_DEG, (dx / width) * MAX_DRAG_ROTATION_DEG * 2)
  );
  const badgeOpacity = Math.min(1, Math.abs(dx) / (width * COMMIT_DISTANCE_RATIO));
  return { rotationDeg, badgeOpacity, direction: dx > 0 ? 'right' : 'left' };
}
