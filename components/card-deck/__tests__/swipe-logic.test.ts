import { describe, it, expect } from 'vitest';
import {
  AXIS_LOCK_DISTANCE,
  COMMIT_DISTANCE_RATIO,
  FALLBACK_CARD_WIDTH,
  MAX_DRAG_ROTATION_DEG,
  UP_COMMIT_DISTANCE_RATIO,
  getSwipeCommitDirection,
  getSwipeVisuals,
  getUpSwipeCommit,
  getUpSwipeVisuals,
  resolveSwipeAxis,
} from '../swipe-logic';

describe('resolveSwipeAxis', () => {
  it('stays undecided under the axis-lock distance', () => {
    expect(resolveSwipeAxis(0, 0)).toBe('undecided');
    expect(resolveSwipeAxis(AXIS_LOCK_DISTANCE - 1, 0)).toBe('undecided');
    expect(resolveSwipeAxis(0, AXIS_LOCK_DISTANCE - 1)).toBe('undecided');
  });

  it('claims clearly horizontal movement', () => {
    expect(resolveSwipeAxis(20, 5)).toBe('horizontal');
    expect(resolveSwipeAxis(-20, 5)).toBe('horizontal');
  });

  it('releases movement that does not dominate vertically enough', () => {
    // |dx| must beat |dy| * 1.2 — a near-diagonal drag belongs to scroll.
    expect(resolveSwipeAxis(15, 14)).toBe('vertical');
    expect(resolveSwipeAxis(0, 20)).toBe('vertical');
    expect(resolveSwipeAxis(-10, 30)).toBe('vertical');
  });
});

describe('getSwipeCommitDirection', () => {
  const width = 320;
  const commitDistance = width * COMMIT_DISTANCE_RATIO; // 112

  it('commits on distance in both directions', () => {
    expect(getSwipeCommitDirection(commitDistance + 1, 0, width)).toBe('right');
    expect(getSwipeCommitDirection(-(commitDistance + 1), 0, width)).toBe('left');
  });

  it('does not commit below both thresholds', () => {
    expect(getSwipeCommitDirection(30, 0.2, width)).toBeNull();
    expect(getSwipeCommitDirection(commitDistance - 1, 0, width)).toBeNull();
  });

  it('commits a short fast flick with matching direction', () => {
    expect(getSwipeCommitDirection(50, 1.2, width)).toBe('right');
    expect(getSwipeCommitDirection(-50, -1.2, width)).toBe('left');
  });

  it('rejects a flick whose velocity opposes the travel', () => {
    // Finger moved right overall but was flying left on release: spring back.
    expect(getSwipeCommitDirection(50, -1.2, width)).toBeNull();
  });

  it('rejects a fast flick that traveled too little', () => {
    expect(getSwipeCommitDirection(20, 2, width)).toBeNull();
  });

  it('falls back to a sane width when the card reports zero', () => {
    const fallbackCommit = FALLBACK_CARD_WIDTH * COMMIT_DISTANCE_RATIO;
    expect(getSwipeCommitDirection(fallbackCommit + 1, 0, 0)).toBe('right');
    expect(getSwipeCommitDirection(fallbackCommit - 1, 0, 0)).toBeNull();
  });
});

describe('getSwipeVisuals', () => {
  const width = 320;

  it('clamps rotation to the configured maximum', () => {
    expect(getSwipeVisuals(width * 2, width).rotationDeg).toBe(MAX_DRAG_ROTATION_DEG);
    expect(getSwipeVisuals(-width * 2, width).rotationDeg).toBe(-MAX_DRAG_ROTATION_DEG);
  });

  it('clamps badge opacity at 1 and scales it toward the commit distance', () => {
    const atCommit = getSwipeVisuals(width * COMMIT_DISTANCE_RATIO, width);
    expect(atCommit.badgeOpacity).toBe(1);
    const halfway = getSwipeVisuals((width * COMMIT_DISTANCE_RATIO) / 2, width);
    expect(halfway.badgeOpacity).toBeCloseTo(0.5);
    expect(getSwipeVisuals(width * 2, width).badgeOpacity).toBe(1);
  });

  it('reports the drag direction', () => {
    expect(getSwipeVisuals(10, width).direction).toBe('right');
    expect(getSwipeVisuals(-10, width).direction).toBe('left');
  });
});

describe('getUpSwipeCommit', () => {
  const height = 480;
  const commitDistance = height * UP_COMMIT_DISTANCE_RATIO;

  it('commits upward movement past the distance threshold', () => {
    expect(getUpSwipeCommit(-(commitDistance + 1), 0, height)).toBe('up');
  });

  it('does not commit downward or below-threshold movement', () => {
    expect(getUpSwipeCommit(200, -2, height)).toBeNull();
    expect(getUpSwipeCommit(-(commitDistance - 1), 0, height)).toBeNull();
  });

  it('commits a short fast upward flick', () => {
    expect(getUpSwipeCommit(-50, -1.2, height)).toBe('up');
  });
});

describe('getUpSwipeVisuals', () => {
  it('scales and clamps the top badge opacity toward the up commit distance', () => {
    const height = 480;
    const halfway = getUpSwipeVisuals(-(height * UP_COMMIT_DISTANCE_RATIO) / 2, height);
    expect(halfway.badgeOpacity).toBeCloseTo(0.5);
    expect(getUpSwipeVisuals(-height, height).badgeOpacity).toBe(1);
    expect(getUpSwipeVisuals(50, height).badgeOpacity).toBe(0);
  });
});
