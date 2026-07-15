import type { PhotoLabLabel } from '@/features/photo-lab/types';

// Chips whose centers land closer than this (normalized units) are considered
// overlapping and the later one is nudged downward.
const MIN_X_GAP = 0.06;
const MIN_Y_GAP = 0.05;
const NUDGE_STEP = 0.05;
const MAX_NUDGES = 3;
const EDGE_MARGIN = 0.03;

function clampToEdges(value: number): number {
  return Math.min(1 - EDGE_MARGIN, Math.max(EDGE_MARGIN, value));
}

/**
 * Greedy pass keeping overlapping label chips readable: labels are placed
 * top-to-bottom, and any chip whose center sits on an already-placed chip is
 * nudged down in small steps (bounded, so a dense cluster degrades to slight
 * overlap instead of drifting off the photo).
 */
export function resolveChipCollisions(labels: PhotoLabLabel[]): PhotoLabLabel[] {
  const placed: { x: number; y: number }[] = [];
  return [...labels]
    .sort((a, b) => a.y - b.y)
    .map((label) => {
      const x = clampToEdges(label.x);
      let y = clampToEdges(label.y);
      const collides = () =>
        placed.some(
          (other) => Math.abs(other.x - x) < MIN_X_GAP && Math.abs(other.y - y) < MIN_Y_GAP,
        );
      for (let i = 0; i < MAX_NUDGES && collides(); i += 1) {
        y = clampToEdges(y + NUDGE_STEP);
      }
      placed.push({ x, y });
      return { ...label, x, y };
    });
}
