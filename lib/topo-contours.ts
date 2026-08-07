/**
 * The geometry of the Topo motif — nested contour rings around a handful of
 * peaks, every fifth one drawn heavier as an index contour.
 *
 * Pure, DOM-free, and parameterised by an injectable RNG, because the same
 * contours are drawn by three different consumers and they must look like the
 * same texture:
 *
 * - the landing page's static background, rendered to SVG on the server by
 *   `/api/backgrounds/topo` with a seeded RNG;
 * - the interactive scratch cover in `components/scratch-field/motifs.ts`,
 *   painted to a canvas with `Math.random`;
 * - tests, with a fixed seed.
 */

export type TopoRing = {
  /** Closed polyline in the coordinate space passed to the builder. */
  points: Array<[number, number]>;
  /** Every fifth contour is heavier, the way index contours are on real maps. */
  index: boolean;
};

export type TopoOptions = {
  /** Relative amount of repeated detail; 1 is the original density. */
  density?: number;
  random?: () => number;
};

/** Ink blue — the same accent the playful motifs draw from. */
export const TOPO_INK: readonly [number, number, number] = [30, 111, 168];

/** Vertical paper gradient the contours are drawn on. */
export const TOPO_BASE_TOP = 'rgb(244, 238, 226)';
export const TOPO_BASE_BOTTOM = 'rgb(236, 229, 215)';

export const TOPO_LINE = {
  indexWidth: 1.6,
  indexAlpha: 0.26,
  width: 0.8,
  alpha: 0.14,
} as const;

/**
 * Peak count is scaled by area against this reference, so a viewport-sized
 * canvas and a page-sized SVG end up equally busy per screen rather than the
 * taller one looking empty.
 */
const REFERENCE_AREA = 1280 * 800;

/** Angular sampling step for a ring, in radians. */
const ANGLE_STEP = 0.08;

export function clampTopoDensity(density: number | undefined): number {
  const value = typeof density === 'number' && Number.isFinite(density) ? density : 1;
  return Math.min(1.6, Math.max(0.35, value));
}

export function buildTopoContours(
  w: number,
  h: number,
  options: TopoOptions = {}
): TopoRing[] {
  const random = options.random ?? Math.random;
  const density = clampTopoDensity(options.density);
  // Linear in area, not in the diagonal: the point is to keep the same number
  // of peaks *per screenful*, so a page-tall SVG is as busy as the viewport-
  // sized canvas the density was chosen on.
  const areaScale = Math.max(0.25, (w * h) / REFERENCE_AREA);

  const peaks = Math.max(2, Math.round((4 + random() * 3) * density * areaScale));
  const contours: TopoRing[] = [];

  for (let p = 0; p < peaks; p += 1) {
    const cx = random() * w;
    const cy = random() * h;
    const rings = Math.max(5, Math.round((10 + random() * 10) * density));
    const step = (18 + random() * 18) / Math.sqrt(density);
    // One wobble profile shared by every ring of this peak, so the rings nest
    // like real contours instead of looking like unrelated blobs.
    const lobes = 3 + Math.floor(random() * 4);
    const phase = random() * Math.PI * 2;
    const squash = 0.6 + random() * 0.7;

    for (let r = 1; r <= rings; r += 1) {
      const radius = r * step;
      const points: Array<[number, number]> = [];
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += ANGLE_STEP) {
        const wobble =
          1 +
          Math.sin(a * lobes + phase) * 0.16 +
          Math.sin(a * (lobes * 2 + 1) - phase) * 0.07;
        const rr = radius * wobble;
        points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squash]);
      }
      contours.push({ points, index: r % 5 === 0 });
    }
  }

  return contours;
}
