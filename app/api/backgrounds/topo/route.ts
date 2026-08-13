import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { createSeededRandom } from '@/lib/seeded-random';
import {
  buildTopoContours,
  clampTopoDensity,
  TOPO_BASE_BOTTOM,
  TOPO_BASE_TOP,
  TOPO_INK,
  TOPO_LINE,
} from '@/lib/topo-contours';

export const runtime = 'nodejs';

const SEEDED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const RANDOM_CACHE_CONTROL = 'no-store';

/**
 * The landing page's static contour background.
 *
 * Generated per request rather than shipped as a file so every visit gets its
 * own map, the way the speckled frame at `/api/backgrounds/get-word` does. It
 * is pure string building — no I/O, no canvas — so it costs a couple of
 * milliseconds.
 *
 * Consumed as a CSS `background-image` with `background-size: cover`, so the
 * viewBox aspect ratio is what matters, not its pixel size. It is deliberately
 * tall: the landing page is several screens, and `cover` should crop the sides
 * on narrow viewports rather than stretch a wide map down the whole page.
 */
const WIDTH = 1200;
const HEIGHT = 3000;
const DEFAULT_DENSITY = 0.4;

/** Grain tile size. A filtered 128² tile repeated as a pattern costs almost
 *  nothing to rasterise; running feTurbulence over the full 1200×3000 area
 *  would be megapixels of noise for the same look. */
const GRAIN_TILE = 128;
const GRAIN_OPACITY = 0.085;

// Whole units only. One viewBox unit is under a screen pixel once the map is
// scaled to cover the page, and the contours are organic — the rounding is
// invisible and it takes a fifth off the payload.
const round = (value: number) => Math.round(value);

function contourPath(points: Array<[number, number]>): string {
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    d += `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
  }
  return `${d}Z`;
}

function renderTopoSvg(seed: string, density: number): string {
  const random = createSeededRandom(seed);
  const contours = buildTopoContours(WIDTH, HEIGHT, { density, random });
  const [r, g, b] = TOPO_INK;
  const ink = `rgb(${r},${g},${b})`;

  // Grouped by weight so the stroke attributes are written twice rather than
  // once per ring — with a few hundred contours that is a real size saving.
  const groups = [
    { rings: contours.filter((c) => !c.index), width: TOPO_LINE.width, alpha: TOPO_LINE.alpha },
    {
      rings: contours.filter((c) => c.index),
      width: TOPO_LINE.indexWidth,
      alpha: TOPO_LINE.indexAlpha,
    },
  ];

  const paths = groups
    .filter((group) => group.rings.length > 0)
    .map(
      (group) =>
        `<g fill="none" stroke="${ink}" stroke-opacity="${group.alpha}" stroke-width="${group.width}">` +
        group.rings.map((ring) => `<path d="${contourPath(ring.points)}"/>`).join('') +
        `</g>`
    )
    .join('');

  // The grain seed is derived from the same stream, so a pinned seed pins the
  // noise too and the response stays byte-identical.
  const grainSeed = Math.floor(random() * 100000);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<defs>` +
    // Top and bottom are the same colour, with the darker tone in the middle.
    // The landing repeats this map down the page (background-repeat: repeat-y),
    // and a gradient that ended on a different colour than it started put a
    // visible horizontal band at every tile boundary. Mirrored, the tiles meet
    // on the same value and the seam disappears.
    `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${TOPO_BASE_TOP}"/>` +
    `<stop offset="0.5" stop-color="${TOPO_BASE_BOTTOM}"/>` +
    `<stop offset="1" stop-color="${TOPO_BASE_TOP}"/>` +
    `</linearGradient>` +
    `<filter id="grain" x="0" y="0" width="${GRAIN_TILE}" height="${GRAIN_TILE}" filterUnits="userSpaceOnUse">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" seed="${grainSeed}"/>` +
    `<feColorMatrix type="saturate" values="0"/>` +
    `</filter>` +
    `<pattern id="grainTile" width="${GRAIN_TILE}" height="${GRAIN_TILE}" patternUnits="userSpaceOnUse">` +
    `<rect width="${GRAIN_TILE}" height="${GRAIN_TILE}" filter="url(#grain)"/>` +
    `</pattern>` +
    `</defs>` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#paper)"/>` +
    paths +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grainTile)" opacity="${GRAIN_OPACITY}"/>` +
    `</svg>`
  );
}

export function GET(request: NextRequest) {
  const explicitSeed = request.nextUrl.searchParams.get('seed');
  const requestedDensity = Number(request.nextUrl.searchParams.get('density'));
  const density = clampTopoDensity(
    Number.isFinite(requestedDensity) && requestedDensity > 0
      ? requestedDensity
      : DEFAULT_DENSITY
  );

  const svg = renderTopoSvg(explicitSeed ?? randomUUID(), density);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': explicitSeed ? SEEDED_CACHE_CONTROL : RANDOM_CACHE_CONTROL,
    },
  });
}
