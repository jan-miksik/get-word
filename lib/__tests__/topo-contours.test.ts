import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '@/lib/seeded-random';
import { buildTopoContours, clampTopoDensity } from '@/lib/topo-contours';

const seeded = (seed: string) => createSeededRandom(seed);

describe('buildTopoContours', () => {
  it('is a pure function of the RNG stream', () => {
    const first = buildTopoContours(1200, 800, { density: 0.4, random: seeded('a') });
    const second = buildTopoContours(1200, 800, { density: 0.4, random: seeded('a') });

    expect(first).toEqual(second);
  });

  it('marks every fifth contour of a peak as an index contour', () => {
    const contours = buildTopoContours(1200, 800, { density: 1, random: seeded('index') });
    const indexed = contours.filter((ring) => ring.index);

    expect(indexed.length).toBeGreaterThan(0);
    expect(indexed.length).toBeLessThan(contours.length / 4);
  });

  it('leaves a closing seam no longer than its other segments', () => {
    // The rings stop just short of a full turn; the consumer closes them
    // (closePath on canvas, Z in the SVG path). That is only invisible while
    // the seam is no coarser than the sampling everywhere else on the ring.
    for (const ring of buildTopoContours(600, 600, { density: 0.4, random: seeded('closed') })) {
      const gap = (a: [number, number], b: [number, number]) =>
        Math.hypot(b[0] - a[0], b[1] - a[1]);
      const segments = ring.points
        .slice(1)
        .map((point, i) => gap(ring.points[i], point));
      const seam = gap(ring.points[ring.points.length - 1], ring.points[0]);

      expect(seam).toBeLessThanOrEqual(Math.max(...segments));
    }
  });

  it('keeps the map equally busy per screenful as the surface grows', () => {
    // A page-tall SVG must not end up sparser than the viewport-sized canvas
    // the density was chosen on — peak count scales with area, not diagonal.
    const viewport = buildTopoContours(1200, 800, { density: 0.4, random: seeded('scale') });
    const page = buildTopoContours(1200, 3200, { density: 0.4, random: seeded('scale') });

    expect(page.length).toBeGreaterThan(viewport.length * 2);
  });
});

describe('clampTopoDensity', () => {
  it('holds the density inside the range the motif was tuned for', () => {
    expect(clampTopoDensity(0.01)).toBe(0.35);
    expect(clampTopoDensity(9)).toBe(1.6);
    expect(clampTopoDensity(0.4)).toBe(0.4);
  });

  it('falls back to 1 for a missing or unusable value', () => {
    expect(clampTopoDensity(undefined)).toBe(1);
    expect(clampTopoDensity(Number.NaN)).toBe(1);
  });
});
