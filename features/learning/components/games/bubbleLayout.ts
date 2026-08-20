export interface BubblePlacement {
  /** Percentages of the field, addressing the bubble's centre. */
  x: number;
  y: number;
  maxWidth: number;
  duration: number;
  delay: number;
  shift: number;
}

/** Keeps bubbles clear of the field's edges so long words are not clipped. */
const MARGIN_X = 16;
const MARGIN_Y = 12;
/** Minimum centre-to-centre distance, in percent of the field's diagonal. */
const MIN_DISTANCE = 21;
const RELAX_PASSES = 60;

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Scatters bubbles across the field, then pushes overlapping pairs apart.
 *
 * Relaxation rather than a grid: a grid reads as a list of options, which is the
 * one thing this exercise is not. Positions are seeded, so a given round always
 * lays out the same way — a re-render must not move a bubble under a finger
 * that is already on its way to it.
 */
export function layoutBubbles(ids: readonly string[], seed: string): BubblePlacement[] {
  const random = seededRandom(`bubbles:${seed}:${ids.join('|')}`);
  const points = ids.map(() => ({
    x: MARGIN_X + random() * (100 - MARGIN_X * 2),
    y: MARGIN_Y + random() * (100 - MARGIN_Y * 2),
  }));

  for (let pass = 0; pass < RELAX_PASSES; pass += 1) {
    let moved = false;
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const dx = points[b].x - points[a].x;
        const dy = points[b].y - points[a].y;
        const distance = Math.hypot(dx, dy) || 0.001;
        if (distance >= MIN_DISTANCE) continue;
        const push = (MIN_DISTANCE - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        points[a].x -= ux * push;
        points[a].y -= uy * push;
        points[b].x += ux * push;
        points[b].y += uy * push;
        moved = true;
      }
    }
    for (const point of points) {
      point.x = Math.min(100 - MARGIN_X, Math.max(MARGIN_X, point.x));
      point.y = Math.min(100 - MARGIN_Y, Math.max(MARGIN_Y, point.y));
    }
    if (!moved) break;
  }

  return points.map((point) => ({
    x: Math.round(point.x * 10) / 10,
    y: Math.round(point.y * 10) / 10,
    maxWidth: 42,
    // Every bubble drifts on its own clock, so the field never pulses in unison.
    duration: 3.4 + random() * 2.8,
    delay: -random() * 4,
    shift: 5 + random() * 7,
  }));
}
