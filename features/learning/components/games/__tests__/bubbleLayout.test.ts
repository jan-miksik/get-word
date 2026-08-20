import { describe, expect, it } from 'vitest';

import { layoutBubbles } from '../bubbleLayout';

const ids = Array.from({ length: 10 }, (_, index) => `w${index}`);

describe('layoutBubbles', () => {
  it('places one bubble per id', () => {
    expect(layoutBubbles(ids, 'seed')).toHaveLength(ids.length);
  });

  it('is deterministic for the same seed and unstable across seeds', () => {
    expect(layoutBubbles(ids, 'a')).toEqual(layoutBubbles(ids, 'a'));
    expect(layoutBubbles(ids, 'a')).not.toEqual(layoutBubbles(ids, 'b'));
  });

  it('keeps every bubble inside the field', () => {
    for (const placement of layoutBubbles(ids, 'seed')) {
      expect(placement.x).toBeGreaterThanOrEqual(16);
      expect(placement.x).toBeLessThanOrEqual(84);
      expect(placement.y).toBeGreaterThanOrEqual(12);
      expect(placement.y).toBeLessThanOrEqual(88);
    }
  });

  it('pushes bubbles apart rather than stacking them', () => {
    const placements = layoutBubbles(ids, 'seed');
    let worst = Infinity;
    for (let a = 0; a < placements.length; a += 1) {
      for (let b = a + 1; b < placements.length; b += 1) {
        worst = Math.min(worst, Math.hypot(placements[a].x - placements[b].x, placements[a].y - placements[b].y));
      }
    }
    // Relaxation is bounded by the field, so this asserts "no pile-up", not the
    // full separation target.
    expect(worst).toBeGreaterThan(12);
  });

  it('gives each bubble its own drift clock', () => {
    const durations = new Set(layoutBubbles(ids, 'seed').map((placement) => placement.duration));
    expect(durations.size).toBeGreaterThan(5);
  });
});
