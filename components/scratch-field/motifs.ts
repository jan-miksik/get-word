/**
 * Texture motifs for the full-page {@link components/ScratchField}.
 *
 * Each motif paints one opaque cover surface into a 2D context sized in CSS
 * pixels. Two families:
 *
 * - **Brushed** — one shared structure (horizontal grain + noise + a diagonal
 *   sheen) in a range of colourways. The structure tested best, so the open
 *   question is only the colour.
 * - **Textures** — structurally different surfaces, for comparison.
 */

import {
  buildTopoContours,
  TOPO_BASE_BOTTOM,
  TOPO_BASE_TOP,
  TOPO_INK,
  TOPO_LINE,
} from '@/lib/topo-contours';

export type MotifPaintOptions = {
  /** Relative amount of repeated detail; 1 is the original density. */
  density?: number;
};

export type MotifPainter = (
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  options?: MotifPaintOptions
) => void;

export type MotifGroup = 'logo' | 'fog' | 'playful' | 'brushed' | 'texture';

export type ScratchMotif = {
  id: string;
  label: string;
  group: MotifGroup;
  /** Two-word feel, shown in the temporary switcher. */
  note: string;
  paint: MotifPainter;
  /**
   * Optional CSS colour laid over the page background *under* the cover, so the
   * wiped-clear side does not have to be the app's beige parchment. Usually
   * semi-transparent, keeping the paper texture visible through the tint.
   */
  revealTint?: string;
};

type Rgb = [number, number, number];

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** A small noise tile reused as a repeating pattern — far cheaper than writing
 *  ImageData across the whole viewport at device-pixel resolution. */
function noisePattern(
  ctx: CanvasRenderingContext2D,
  opts: {
    size?: number;
    tint: Rgb;
    /** Lightness spread around the tint, 0–255. */
    spread: number;
    alphaMin: number;
    alphaMax: number;
  }
): CanvasPattern | null {
  const size = opts.size ?? 96;
  const tile = document.createElement('canvas');
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return null;
  const image = tileCtx.createImageData(size, size);
  const [tr, tg, tb] = opts.tint;
  for (let i = 0; i < image.data.length; i += 4) {
    const d = (Math.random() - 0.5) * opts.spread;
    image.data[i] = Math.max(0, Math.min(255, tr + d));
    image.data[i + 1] = Math.max(0, Math.min(255, tg + d));
    image.data[i + 2] = Math.max(0, Math.min(255, tb + d));
    image.data[i + 3] = opts.alphaMin + Math.random() * (opts.alphaMax - opts.alphaMin);
  }
  tileCtx.putImageData(image, 0, 0);
  return ctx.createPattern(tile, 'repeat');
}

function fillNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: Parameters<typeof noisePattern>[1]
) {
  const pattern = noisePattern(ctx, opts);
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
}

const rgba = ([r, g, b]: readonly [number, number, number], a: number) =>
  `rgba(${r},${g},${b},${a})`;

function motifDensity(options?: MotifPaintOptions): number {
  return Math.min(1.6, Math.max(0.35, options?.density ?? 1));
}

/** Soft irregular patches — mottling, verdigris, damp spots in paper. */
function blotches(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: { count: number; color: string; minR: number; maxR: number; alpha: number }
) {
  for (let i = 0; i < opts.count; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = opts.minR + Math.random() * (opts.maxR - opts.minR);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, opts.color);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = opts.alpha * (0.5 + Math.random() * 0.5);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A wide diagonal highlight so metallic surfaces catch "light". */
function sheen(ctx: CanvasRenderingContext2D, w: number, h: number, tint: Rgb, peak: number) {
  const grad = ctx.createLinearGradient(0, h, w, 0);
  grad.addColorStop(0, rgba(tint, 0));
  grad.addColorStop(0.34, rgba(tint, peak * 0.24));
  grad.addColorStop(0.47, rgba(tint, peak));
  grad.addColorStop(0.6, rgba(tint, peak * 0.28));
  grad.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  const grad = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.25,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75
  );
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Final light wash over a busy surface.
 *
 * The landing copy is near-black ink sitting *on top of* the cover, so a motif
 * with strong dark-to-light swings — chips, dense halftone — makes the text
 * fight for contrast wherever a dark element lands behind a letter. Blending
 * the whole surface towards a light tone costs some punch but keeps hue
 * relationships intact, which a per-channel `lighten` clamp does not: that
 * would wipe saturated mid-darks like the ink blue out entirely.
 */
function veil(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function linearBase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stops: Array<[number, string]>,
  diagonal = true
) {
  const grad = diagonal
    ? ctx.createLinearGradient(0, 0, w, h)
    : ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ *
 * The fogged-glass family
 * ------------------------------------------------------------------ */

type FogSpec = {
  /** The milky condensation film itself. */
  haze: Rgb;
  /** Contact shadow under the beads, giving them volume. */
  shadow: Rgb;
  /** Film opacity, 0–1. Never 1: fog is translucent, that is the whole point. */
  density: number;
};

/**
 * Condensation on a car window.
 *
 * Unlike every other motif this cover is deliberately **translucent** — you can
 * make out the page through it, just washed out and colourless, and wiping
 * brings it back into focus. That is what makes it read as fog rather than as
 * paint: an opaque white sheet just looks like a white sheet.
 *
 * Three things sell it: an uneven film (condensation is never even), heavier fog
 * towards the edges (the middle clears first, nearest the vents), and fine
 * beading with a contact shadow. No runs — drips read as grime on the glass and
 * fought the calm of the page.
 */
function fogged(spec: FogSpec): MotifPainter {
  return (ctx, w, h) => {
    ctx.save();

    const film = ctx.createLinearGradient(0, 0, 0, h);
    film.addColorStop(0, rgba(spec.haze, spec.density));
    film.addColorStop(0.5, rgba(spec.haze, spec.density * 0.88));
    film.addColorStop(1, rgba(spec.haze, spec.density));
    ctx.fillStyle = film;
    ctx.fillRect(0, 0, w, h);

    // Uneven condensation: thicker patches…
    blotches(ctx, w, h, {
      count: 18,
      color: rgba(spec.haze, 1),
      minR: 120,
      maxR: 460,
      alpha: 0.22,
    });
    // …and thinner ones, cut back out of the film.
    ctx.globalCompositeOperation = 'destination-out';
    blotches(ctx, w, h, {
      count: 14,
      color: 'rgb(0,0,0)',
      minR: 100,
      maxR: 380,
      alpha: 0.14,
    });
    ctx.globalCompositeOperation = 'source-over';

    // Heavier towards the edges — the middle of a windscreen clears first.
    vignette(ctx, w, h, rgba(spec.haze, 0.34));

    // Fine beading across the whole pane.
    for (let i = 0; i < Math.round((w * h) / 2200); i += 1) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 0.5 + Math.random() * 1.8;
      ctx.fillStyle = rgba(spec.shadow, 0.1 + Math.random() * 0.12);
      ctx.beginPath();
      ctx.arc(x, y + r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    fillNoise(ctx, w, h, { tint: spec.haze, spread: 60, alphaMin: 8, alphaMax: 26 });
    ctx.restore();
  };
}

/**
 * Colourways built *around* the parchment rather than over it: the beige stays
 * as the uncovered side, and the haze carries the colour. Wiping therefore goes
 * pale-and-cool → warm-and-saturated, which is a clearer read than the earlier
 * heavy reveal tints and keeps the app's own palette intact.
 *
 * The hues are drawn from what already sits next to that beige — the ink blue
 * and the rust — plus one warm-on-warm and one complementary green.
 */
const FOG_COLOURWAYS: Array<{
  id: string;
  label: string;
  note: string;
  spec: FogSpec;
  revealTint?: string;
}> = [
  {
    id: 'fog-cream',
    label: 'Fog — cream',
    note: 'warm on warm',
    spec: { haze: [242, 236, 222], shadow: [150, 134, 106], density: 0.9 },
  },
  {
    id: 'fog-sky',
    label: 'Fog — sky',
    note: 'ink-blue haze',
    spec: { haze: [220, 232, 241], shadow: [96, 130, 158], density: 0.88 },
    // A whisper of the app's blue on the uncovered side, not a replacement for
    // the beige — just enough to stop the two halves reading as two designs.
    revealTint: 'rgba(110, 152, 186, 0.16)',
  },
  {
    id: 'fog-blush',
    label: 'Fog — blush',
    note: 'rust, softened',
    spec: { haze: [245, 230, 222], shadow: [172, 118, 96], density: 0.89 },
  },
  {
    id: 'fog-mint',
    label: 'Fog — mint',
    note: 'eucalyptus',
    spec: { haze: [225, 237, 228], shadow: [104, 142, 120], density: 0.88 },
  },
];

/* ------------------------------------------------------------------ *
 * The brushed family
 * ------------------------------------------------------------------ */

type BrushedSpec = {
  /** Four-stop diagonal base: light → mid → dark → mid. */
  base: [Rgb, Rgb, Rgb];
  /** Grain streak colours. */
  light: Rgb;
  dark: Rgb;
  noise: Rgb;
  sheenTint: Rgb;
  sheenPeak?: number;
};

/**
 * The structure that tested best: long near-horizontal grain of alternating
 * light and dark strokes over a diagonal base, dusted with noise and finished
 * with one broad diagonal highlight. Only the palette changes between
 * colourways — the geometry is identical, on purpose.
 */
function brushed(spec: BrushedSpec): MotifPainter {
  const [light, mid, dark] = spec.base;
  return (ctx, w, h) => {
    linearBase(ctx, w, h, [
      [0, rgba(light, 1)],
      [0.45, rgba(mid, 1)],
      [0.75, rgba(dark, 1)],
      [1, rgba(mid, 1)],
    ]);

    for (let i = 0; i < Math.round(h / 1.1); i += 1) {
      const y = Math.random() * h;
      const x0 = Math.random() * w - w * 0.2;
      const len = w * (0.2 + Math.random() * 0.9);
      ctx.lineWidth = Math.random() < 0.15 ? 2 : 1;
      ctx.strokeStyle =
        Math.random() > 0.5
          ? rgba(spec.light, 0.05 + Math.random() * 0.13)
          : rgba(spec.dark, 0.05 + Math.random() * 0.12);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + len, y + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }

    fillNoise(ctx, w, h, { tint: spec.noise, spread: 130, alphaMin: 34, alphaMax: 74 });
    sheen(ctx, w, h, spec.sheenTint, spec.sheenPeak ?? 0.26);
  };
}

const BRUSHED_COLOURWAYS: Array<{ id: string; label: string; note: string; spec: BrushedSpec }> = [
  {
    id: 'pewter',
    label: 'Pewter',
    note: 'warm grey',
    spec: {
      base: [
        [199, 189, 168],
        [157, 146, 125],
        [124, 114, 95],
      ],
      light: [255, 250, 236],
      dark: [58, 48, 32],
      noise: [188, 180, 162],
      sheenTint: [255, 252, 240],
    },
  },
  {
    id: 'brass',
    label: 'Brass',
    note: 'champagne gold',
    spec: {
      base: [
        [214, 187, 128],
        [178, 146, 84],
        [140, 111, 56],
      ],
      light: [255, 243, 202],
      dark: [64, 46, 14],
      noise: [200, 172, 112],
      sheenTint: [255, 246, 214],
      sheenPeak: 0.3,
    },
  },
  {
    id: 'steel',
    label: 'Steel',
    note: 'cool blue-grey',
    spec: {
      base: [
        [190, 200, 210],
        [143, 157, 172],
        [110, 125, 142],
      ],
      light: [246, 251, 255],
      dark: [26, 38, 52],
      noise: [176, 188, 200],
      sheenTint: [242, 250, 255],
      sheenPeak: 0.3,
    },
  },
  {
    id: 'sage',
    label: 'Sage',
    note: 'muted green',
    spec: {
      base: [
        [193, 199, 172],
        [149, 159, 127],
        [117, 128, 98],
      ],
      light: [248, 252, 232],
      dark: [38, 48, 26],
      noise: [182, 190, 162],
      sheenTint: [250, 253, 236],
    },
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    note: 'muted rust',
    spec: {
      base: [
        [211, 170, 148],
        [180, 128, 102],
        [147, 97, 74],
      ],
      light: [255, 235, 218],
      dark: [62, 30, 18],
      noise: [198, 156, 132],
      sheenTint: [255, 238, 222],
    },
  },
  {
    id: 'bone',
    label: 'Bone',
    note: 'pale near-white',
    spec: {
      base: [
        [237, 232, 219],
        [211, 204, 187],
        [186, 178, 159],
      ],
      light: [255, 254, 249],
      dark: [78, 68, 50],
      noise: [224, 218, 204],
      sheenTint: [255, 255, 250],
      sheenPeak: 0.2,
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    note: 'dark charcoal',
    spec: {
      base: [
        [112, 112, 110],
        [76, 77, 76],
        [52, 53, 52],
      ],
      light: [232, 234, 230],
      dark: [8, 8, 8],
      noise: [104, 105, 103],
      sheenTint: [236, 240, 236],
      sheenPeak: 0.2,
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    note: 'deep navy',
    spec: {
      base: [
        [56, 88, 116],
        [32, 60, 86],
        [20, 42, 64],
      ],
      light: [206, 232, 252],
      dark: [4, 14, 26],
      noise: [48, 78, 106],
      sheenTint: [214, 236, 255],
      sheenPeak: 0.22,
    },
  },
];

/* ------------------------------------------------------------------ *
 * The playful family
 *
 * Everything above is a *material* — metal, stone, cloth, glass — and materials
 * are calm by nature. These three are printed or made things instead, and they
 * take their colours from the two the app already uses next to the parchment
 * (ink blue #1E6FA8, rust #bf472a) plus a warm ochre, so "livelier" does not
 * mean "a different brand".
 * ------------------------------------------------------------------ */

/** The accent set every playful motif draws from. */
const PLAYFUL_INK: Rgb = [30, 111, 168];
const PLAYFUL_RUST: Rgb = [191, 71, 42];
const PLAYFUL_OCHRE: Rgb = [214, 158, 62];
const PLAYFUL_TEAL: Rgb = [58, 138, 124];

/** Terrazzo: chips of colour suspended in a pale binder. Cheerful without being
 *  loud, because the chips are small and the binder is most of the surface. */
const terrazzo: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(240, 234, 220)'],
      [0.5, 'rgb(232, 225, 209)'],
      [1, 'rgb(237, 231, 216)'],
    ],
    false
  );

  blotches(ctx, w, h, {
    count: 16,
    color: 'rgb(247, 243, 233)',
    minR: 120,
    maxR: 400,
    alpha: 0.4,
  });

  // No charcoal chip: a near-black fleck landing behind a letter was the worst
  // of the legibility problems, and terrazzo reads fine without a darkest tone.
  const chipColours: Rgb[] = [
    PLAYFUL_INK,
    PLAYFUL_RUST,
    PLAYFUL_OCHRE,
    PLAYFUL_TEAL,
    [216, 143, 122],
    [122, 156, 196],
  ];

  // Irregular polygons, not circles — a chip is a broken piece of stone.
  const chips = Math.round((w * h) / 2600);
  for (let i = 0; i < chips; i += 1) {
    const cx = Math.random() * w;
    const cy = Math.random() * h;
    const radius = 2.5 + Math.random() * (Math.random() < 0.12 ? 12 : 6);
    const sides = 4 + Math.floor(Math.random() * 3);
    const spin = Math.random() * Math.PI * 2;
    const colour = chipColours[Math.floor(Math.random() * chipColours.length)];
    ctx.fillStyle = rgba(colour, 0.4 + Math.random() * 0.28);
    ctx.beginPath();
    for (let s = 0; s < sides; s += 1) {
      const a = spin + (s / sides) * Math.PI * 2;
      const r = radius * (0.65 + Math.random() * 0.55);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Ground-in dust between the chips.
  for (let i = 0; i < Math.round((w * h) / 1600); i += 1) {
    ctx.fillStyle = `rgba(112, 100, 78, ${0.06 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  fillNoise(ctx, w, h, { tint: [236, 230, 216], spread: 70, alphaMin: 14, alphaMax: 38 });
  veil(ctx, w, h, 'rgba(248, 244, 234, 0.26)');
};

/** Risograph: two misregistered halftone screens over cream. Where the rust and
 *  the blue dots overlap they overprint into a third colour — that accident is
 *  the whole charm of the process. */
const riso: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(244, 238, 224)'],
      [1, 'rgb(236, 229, 212)'],
    ],
    false
  );

  // Dot size swells and shrinks across the sheet so the screen has tonal
  // movement instead of reading as graph paper.
  const screen = (colour: Rgb, angle: number, pitch: number, phase: number, peak: number) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    const span = Math.hypot(w, h) / 2 + pitch;
    ctx.fillStyle = rgba(colour, 0.5);
    for (let y = -span; y < span; y += pitch) {
      for (let x = -span; x < span; x += pitch) {
        const wave =
          Math.sin(x / 190 + phase) * Math.cos(y / 150 - phase) * 0.5 + 0.5;
        const r = peak * (0.25 + wave * 0.75);
        if (r < 0.25) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  screen(PLAYFUL_RUST, 0.26, 7, 0.4, 2.5);
  screen(PLAYFUL_INK, -0.34, 7, 2.1, 2.5);
  screen(PLAYFUL_OCHRE, 0.95, 11, 3.4, 1.8);

  fillNoise(ctx, w, h, { tint: [240, 233, 218], spread: 60, alphaMin: 12, alphaMax: 34 });
  veil(ctx, w, h, 'rgba(250, 245, 234, 0.3)');
};

/** Sherbet: a soft wash through warm pastels, heavily grained so it reads as
 *  printed rather than as a CSS gradient. The lightest, sunniest motif here. */
const sherbet: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(252, 206, 164)'],
    [0.3, 'rgb(250, 224, 152)'],
    [0.58, 'rgb(198, 232, 196)'],
    [0.82, 'rgb(184, 216, 238)'],
    [1, 'rgb(244, 204, 200)'],
  ]);

  blotches(ctx, w, h, {
    count: 10,
    color: 'rgb(255, 196, 148)',
    minR: 200,
    maxR: 560,
    alpha: 0.42,
  });
  blotches(ctx, w, h, {
    count: 8,
    color: 'rgb(176, 226, 206)',
    minR: 180,
    maxR: 520,
    alpha: 0.38,
  });
  blotches(ctx, w, h, {
    count: 6,
    color: 'rgb(244, 206, 232)',
    minR: 160,
    maxR: 460,
    alpha: 0.34,
  });

  // Print grain, kept deliberately light: a heavy single-tint noise pass sits on
  // top of every hue at once and drags the whole wash towards grey.
  fillNoise(ctx, w, h, { tint: [250, 238, 220], spread: 120, alphaMin: 8, alphaMax: 26 });
  veil(ctx, w, h, 'rgba(253, 250, 244, 0.18)');
};

/* ------------------------------------------------------------------ *
 * From the logo
 *
 * The mark is two things: a tiled arch stamp (a 10×6 cell whose bottom edge is
 * scooped out by a curve) and a peach teardrop, `#e9c6af`. Both are lifted here
 * verbatim as SVG path data so the field is literally made of the logo rather
 * than of something that resembles it.
 * ------------------------------------------------------------------ */

const LOGO_ARCH_PATH = 'M 0,6 V 0 H 10 V 6 C 10,3 8,1 5,1 2,1 0,3 0,6 Z';
const LOGO_DROP_PATH =
  'm 93.055842,39.786822 c 30.167388,-9.68662 64.021408,21.905596 64.021408,55.905599 0,17.999999 -6,31.999999 -18,43.999999 -8,8 -14,16 -18,26 -2.72055,14.48099 -12,10 -17,6 -8.999996,-6 -13.533623,-12.39912 -22.20176,-19.86549 -14,-12 -30.204508,-28.14186 -30.798236,-52.134509 C 50.291852,67.954222 68.300699,47.735592 93.055842,39.786822 Z';
const LOGO_PEACH: Rgb = [233, 198, 175];
// Centre and height of the drop path in its own user units, for placing it.
const DROP_CENTRE_X = 104;
const DROP_CENTRE_Y = 107;
const DROP_HEIGHT = 140;

/** The logo's arch stamp tiled across the field, in ink on cream and kept far
 *  from full strength so the pattern is a texture, not a wall. */
const logoScallop: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(243, 237, 224)'],
      [0.5, 'rgb(235, 228, 212)'],
      [1, 'rgb(240, 234, 220)'],
    ],
    false
  );

  const arch = new Path2D(LOGO_ARCH_PATH);
  const scale = 3.4;
  const cellW = 10 * scale;
  const cellH = 6 * scale;

  // Rows drift in and out of strength so the tessellation breathes instead of
  // reading as wallpaper, and every so often a row picks up the peach.
  let row = 0;
  for (let y = -cellH; y < h + cellH; y += cellH) {
    const wave = Math.sin(row / 5.5) * 0.5 + 0.5;
    const peachRow = row % 7 === 3;
    const colour = peachRow ? LOGO_PEACH : PLAYFUL_INK;
    const alpha = peachRow ? 0.3 + wave * 0.2 : 0.09 + wave * 0.09;
    ctx.fillStyle = rgba(colour, alpha);
    // Half-cell stagger, exactly as the mark's own rows sit.
    const shift = row % 2 === 0 ? 0 : cellW / 2;
    for (let x = -cellW; x < w + cellW; x += cellW) {
      ctx.save();
      ctx.translate(x + shift, y);
      ctx.scale(scale, scale);
      ctx.fill(arch);
      ctx.restore();
    }
    row += 1;
  }

  fillNoise(ctx, w, h, { tint: [238, 231, 216], spread: 70, alphaMin: 14, alphaMax: 36 });
  veil(ctx, w, h, 'rgba(250, 246, 236, 0.2)');
};

/** The logo's teardrop, scattered at every size and angle — some filled, some
 *  outlined — like a sheet of stickers of the mark. */
const logoDrops: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(245, 238, 226)'],
    [0.55, 'rgb(236, 228, 213)'],
    [1, 'rgb(242, 235, 222)'],
  ]);

  blotches(ctx, w, h, {
    count: 14,
    color: 'rgb(250, 244, 233)',
    minR: 140,
    maxR: 420,
    alpha: 0.36,
  });

  const drop = new Path2D(LOGO_DROP_PATH);
  const tints: Rgb[] = [LOGO_PEACH, [222, 175, 150], [199, 208, 216], [214, 184, 146]];

  const place = (x: number, y: number, height: number, angle: number, draw: () => void) => {
    const s = height / DROP_HEIGHT;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    ctx.translate(-DROP_CENTRE_X, -DROP_CENTRE_Y);
    draw();
    ctx.restore();
  };

  const count = Math.round((w * h) / 26000);
  for (let i = 0; i < count; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const height = 18 + Math.random() * (Math.random() < 0.15 ? 90 : 34);
    const angle = Math.random() * Math.PI * 2;
    const tint = tints[Math.floor(Math.random() * tints.length)];
    if (Math.random() < 0.3) {
      place(x, y, height, angle, () => {
        // Stroke width is in pre-scale units, so undo the scale to keep every
        // outline the same visual weight regardless of the drop's size.
        ctx.lineWidth = (DROP_HEIGHT / height) * 1.6;
        ctx.strokeStyle = rgba(tint, 0.55);
        ctx.stroke(drop);
      });
    } else {
      place(x, y, height, angle, () => {
        ctx.fillStyle = rgba(tint, 0.34 + Math.random() * 0.26);
        ctx.fill(drop);
      });
    }
  }

  fillNoise(ctx, w, h, { tint: [240, 233, 219], spread: 80, alphaMin: 16, alphaMax: 40 });
  veil(ctx, w, h, 'rgba(250, 246, 237, 0.18)');
};

/* ------------------------------------------------------------------ *
 * Two more, off the leash
 * ------------------------------------------------------------------ */

/** Marbled endpaper. Ribbons of colour laid down in waves, then dragged across
 *  by a comb — the paper you find inside the cover of an old book, which is
 *  about as close to "a language app" as an abstract texture gets. */
const marbled: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(246, 240, 227)'],
      [1, 'rgb(238, 231, 216)'],
    ],
    false
  );

  const inks: Rgb[] = [PLAYFUL_INK, PLAYFUL_RUST, PLAYFUL_OCHRE, PLAYFUL_TEAL, LOGO_PEACH];

  // Every ribbon shares one wave field, with its own phase — that shared
  // motion is what makes separate bands look combed rather than scribbled.
  const waveAt = (x: number, phase: number, amp: number) =>
    Math.sin(x / 130 + phase) * amp +
    Math.sin(x / 47 + phase * 1.7) * amp * 0.4 +
    Math.sin(x / 19 + phase * 2.6) * amp * 0.16;

  const bands = 26;
  for (let i = 0; i < bands; i += 1) {
    const phase = i * 0.42;
    const amp = 16 + Math.random() * 26;
    const y0 = (i / bands) * (h + 200) - 100;
    const thickness = 6 + Math.random() * 22;
    const colour = inks[i % inks.length];

    ctx.beginPath();
    ctx.moveTo(0, y0 + waveAt(0, phase, amp));
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + waveAt(x, phase, amp));
    for (let x = w; x >= 0; x -= 8) {
      ctx.lineTo(x, y0 + thickness + waveAt(x, phase * 1.05, amp));
    }
    ctx.closePath();
    ctx.fillStyle = rgba(colour, 0.16 + Math.random() * 0.14);
    ctx.fill();

    // The dark vein that rides the top edge of a marbled band.
    ctx.beginPath();
    ctx.moveTo(0, y0 + waveAt(0, phase, amp));
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + waveAt(x, phase, amp));
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = rgba(colour, 0.3);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [242, 235, 220], spread: 80, alphaMin: 14, alphaMax: 36 });
  veil(ctx, w, h, 'rgba(250, 246, 236, 0.22)');
};

/** Contour map. Nested rings around a handful of peaks, every fifth one drawn
 *  heavier as an index contour. Quiet, but it rewards looking at — and thin
 *  lines on a pale ground are the friendliest thing possible under text. */
const topo: MotifPainter = (ctx, w, h, options) => {
  linearBase(ctx, w, h, [[0, TOPO_BASE_TOP], [1, TOPO_BASE_BOTTOM]], false);

  // Geometry is shared with the landing page's static SVG background
  // (`/api/backgrounds/topo`) so the two read as the same texture.
  for (const ring of buildTopoContours(w, h, { density: motifDensity(options) })) {
    ctx.beginPath();
    ring.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.lineWidth = ring.index ? TOPO_LINE.indexWidth : TOPO_LINE.width;
    ctx.strokeStyle = rgba(TOPO_INK, ring.index ? TOPO_LINE.indexAlpha : TOPO_LINE.alpha);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [240, 233, 219], spread: 70, alphaMin: 14, alphaMax: 34 });
};

/** Pale sea glass: overlapping translucent pieces with softly etched rims. */
const seaGlass: MotifPainter = (ctx, w, h, options) => {
  const density = motifDensity(options);
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(218, 236, 229)'],
      [0.5, 'rgb(202, 226, 226)'],
      [1, 'rgb(229, 220, 232)'],
    ],
    false
  );

  const colours: Rgb[] = [
    [56, 145, 148],
    [76, 122, 172],
    [167, 102, 145],
    [224, 146, 106],
  ];
  const pieces = Math.round(34 * density);
  for (let i = 0; i < pieces; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const rx = 55 + Math.random() * 170;
    const ry = rx * (0.38 + Math.random() * 0.5);
    const colour = colours[i % colours.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = rgba(colour, 0.045 + Math.random() * 0.08);
    ctx.strokeStyle = rgba(colour, 0.12 + Math.random() * 0.09);
    ctx.lineWidth = 1 + Math.random() * 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  fillNoise(ctx, w, h, { tint: [214, 230, 226], spread: 70, alphaMin: 14, alphaMax: 38 });
  veil(ctx, w, h, 'rgba(250, 250, 242, 0.18)');
};

/** A pale aurora: broad spectral ribbons without sacrificing dark-copy contrast. */
const aurora: MotifPainter = (ctx, w, h, options) => {
  const density = motifDensity(options);
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(235, 239, 231)'],
      [1, 'rgb(224, 229, 236)'],
    ],
    false
  );

  const ribbons: Rgb[] = [
    [45, 164, 145],
    [68, 123, 190],
    [163, 91, 170],
    [232, 134, 91],
  ];
  const count = Math.max(4, Math.round(7 * density));
  for (let i = 0; i < count; i += 1) {
    const y = ((i + 0.5) / count) * h;
    const amplitude = 45 + Math.random() * 100;
    const band = 80 + Math.random() * 140;
    const colour = ribbons[i % ribbons.length];
    const gradient = ctx.createLinearGradient(0, y - band, 0, y + band);
    gradient.addColorStop(0, rgba(colour, 0));
    gradient.addColorStop(0.5, rgba(colour, 0.11 + Math.random() * 0.08));
    gradient.addColorStop(1, rgba(colour, 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = band;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-100, y);
    for (let x = -100; x <= w + 100; x += 24) {
      const wave = Math.sin(x / (150 + i * 11) + i * 1.7) * amplitude;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [226, 232, 229], spread: 85, alphaMin: 12, alphaMax: 34 });
  veil(ctx, w, h, 'rgba(252, 248, 238, 0.15)');
};

/** Technical blueprint: a saturated cyan grid with drafted circles and marks. */
const blueprint: MotifPainter = (ctx, w, h, options) => {
  const density = motifDensity(options);
  linearBase(ctx, w, h, [
    [0, 'rgb(28, 105, 146)'],
    [0.55, 'rgb(20, 82, 123)'],
    [1, 'rgb(17, 69, 108)'],
  ]);

  const pitch = Math.min(110, Math.max(34, 64 / density));
  for (let x = 0; x <= w; x += pitch) {
    const major = Math.round(x / pitch) % 5 === 0;
    ctx.strokeStyle = `rgba(213, 239, 246, ${major ? 0.2 : 0.09})`;
    ctx.lineWidth = major ? 1.2 : 0.7;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += pitch) {
    const major = Math.round(y / pitch) % 5 === 0;
    ctx.strokeStyle = `rgba(213, 239, 246, ${major ? 0.2 : 0.09})`;
    ctx.lineWidth = major ? 1.2 : 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const diagrams = Math.round(12 * density);
  for (let i = 0; i < diagrams; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const radius = 24 + Math.random() * 110;
    ctx.strokeStyle = `rgba(230, 247, 250, ${0.12 + Math.random() * 0.14})`;
    ctx.lineWidth = 0.8 + Math.random() * 0.8;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * (1.2 + Math.random() * 0.8));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - radius * 1.2, y);
    ctx.lineTo(x + radius * 1.2, y);
    ctx.moveTo(x, y - radius * 1.2);
    ctx.lineTo(x, y + radius * 1.2);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [80, 146, 176], spread: 90, alphaMin: 10, alphaMax: 34 });
  vignette(ctx, w, h, 'rgba(4, 36, 64, 0.28)');
};

/** Fine rice paper: long plant fibres, short inclusions and warm translucency. */
const ricePaper: MotifPainter = (ctx, w, h, options) => {
  const density = motifDensity(options);
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(241, 234, 214)'],
      [0.5, 'rgb(232, 222, 198)'],
      [1, 'rgb(246, 239, 220)'],
    ],
    false
  );

  const fibres = Math.round((w * h * density) / 2100);
  for (let i = 0; i < fibres; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const angle = Math.random() * Math.PI;
    const length = 16 + Math.random() * 90;
    ctx.strokeStyle =
      Math.random() > 0.35
        ? `rgba(116, 96, 63, ${0.05 + Math.random() * 0.13})`
        : `rgba(187, 83, 53, ${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle + 0.35) * length * 0.5,
      y + Math.sin(angle + 0.35) * length * 0.5,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length
    );
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [238, 229, 207], spread: 95, alphaMin: 18, alphaMax: 48 });
  vignette(ctx, w, h, 'rgba(102, 76, 36, 0.12)');
};

/* ------------------------------------------------------------------ *
 * Other textures
 * ------------------------------------------------------------------ */

/** Deep ink-blue copperplate: fine engraved cross-hatch over a dark field. */
const engraving: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(29, 66, 92)'],
    [0.5, 'rgb(16, 42, 62)'],
    [1, 'rgb(24, 57, 80)'],
  ]);

  blotches(ctx, w, h, {
    count: 14,
    color: 'rgb(52, 104, 138)',
    minR: 160,
    maxR: 460,
    alpha: 0.3,
  });

  // Two hatch directions at slightly different pitches; where they cross the
  // surface darkens, exactly like a printed plate.
  const hatch = (angle: number, pitch: number, alpha: number) => {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(angle);
    const span = Math.hypot(w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(190, 222, 245, ${alpha})`;
    for (let y = -span; y < span; y += pitch) {
      ctx.beginPath();
      ctx.moveTo(-span, y);
      ctx.lineTo(span, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.restore();
  };
  hatch(Math.PI / 4, 7, 0.07);
  hatch(-Math.PI / 4, 9, 0.055);

  fillNoise(ctx, w, h, { tint: [120, 160, 190], spread: 90, alphaMin: 10, alphaMax: 38 });
  vignette(ctx, w, h, 'rgba(6, 20, 32, 0.55)');
};

/** Chalkboard: near-black slate, chalk dust, a couple of wiped smears. */
const chalkboard: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(46, 52, 47)'],
    [0.55, 'rgb(31, 36, 32)'],
    [1, 'rgb(38, 44, 39)'],
  ]);

  // Broad wiped smears: the ghost of an eraser dragged across the board.
  for (let i = 0; i < 10; i += 1) {
    const y = Math.random() * h;
    const grad = ctx.createLinearGradient(0, y - 40, w, y + 40);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, `rgba(226, 232, 220, ${0.03 + Math.random() * 0.05})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - 60, w, 120);
  }

  // Chalk dust.
  for (let i = 0; i < Math.round((w * h) / 900); i += 1) {
    ctx.fillStyle = `rgba(236, 240, 228, ${0.06 + Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  fillNoise(ctx, w, h, { tint: [140, 148, 138], spread: 80, alphaMin: 8, alphaMax: 30 });
  vignette(ctx, w, h, 'rgba(0, 0, 0, 0.4)');
};

/** Oxidised copper leaf: warm metal with verdigris creeping across it. */
const copper: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(163, 92, 52)'],
    [0.4, 'rgb(126, 63, 34)'],
    [0.72, 'rgb(150, 84, 45)'],
    [1, 'rgb(104, 50, 28)'],
  ]);

  blotches(ctx, w, h, {
    count: 26,
    color: 'rgb(96, 142, 122)',
    minR: 70,
    maxR: 320,
    alpha: 0.42,
  });
  blotches(ctx, w, h, {
    count: 12,
    color: 'rgb(212, 152, 96)',
    minR: 60,
    maxR: 200,
    alpha: 0.3,
  });

  // Hammered streaks, short and irregular rather than brushed.
  for (let i = 0; i < Math.round(h / 2.4); i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 20 + Math.random() * 120;
    ctx.lineWidth = 1;
    ctx.strokeStyle =
      Math.random() > 0.45
        ? `rgba(255, 214, 168, ${0.05 + Math.random() * 0.13})`
        : `rgba(58, 24, 10, ${0.05 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [176, 108, 62], spread: 120, alphaMin: 24, alphaMax: 66 });
  sheen(ctx, w, h, [255, 226, 182], 0.22);
};

/** Kraft paper: the closest motif to the app's own parchment, so the reveal is
 *  a change of texture rather than a change of world. */
const kraft: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(199, 170, 126)'],
      [0.5, 'rgb(178, 147, 101)'],
      [1, 'rgb(188, 159, 114)'],
    ],
    false
  );

  blotches(ctx, w, h, {
    count: 22,
    color: 'rgb(214, 190, 150)',
    minR: 90,
    maxR: 360,
    alpha: 0.34,
  });

  // Paper fibres: short dashes in every direction.
  for (let i = 0; i < Math.round((w * h) / 700); i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = Math.random() * Math.PI;
    const len = 2 + Math.random() * 9;
    ctx.lineWidth = Math.random() < 0.2 ? 1.4 : 0.8;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? `rgba(247, 232, 202, ${0.1 + Math.random() * 0.22})`
        : `rgba(92, 68, 38, ${0.06 + Math.random() * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [196, 168, 124], spread: 110, alphaMin: 28, alphaMax: 62 });
  vignette(ctx, w, h, 'rgba(84, 58, 28, 0.22)');
};

/** Woven linen: a real warp/weft grid, so the grain reads in both directions
 *  instead of only along the brush. */
const linen: MotifPainter = (ctx, w, h) => {
  linearBase(
    ctx,
    w,
    h,
    [
      [0, 'rgb(214, 205, 184)'],
      [0.5, 'rgb(196, 185, 161)'],
      [1, 'rgb(205, 195, 172)'],
    ],
    false
  );

  const PITCH = 5;
  // Warp (vertical) then weft (horizontal), each thread slightly uneven so the
  // weave never looks like a printed grid.
  for (let x = 0; x < w; x += PITCH) {
    ctx.lineWidth = 1 + Math.random() * 0.8;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? `rgba(250, 245, 231, ${0.14 + Math.random() * 0.16})`
        : `rgba(104, 92, 68, ${0.06 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(x + (Math.random() - 0.5), 0);
    ctx.lineTo(x + (Math.random() - 0.5), h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += PITCH) {
    ctx.lineWidth = 1 + Math.random() * 0.8;
    ctx.strokeStyle =
      Math.random() > 0.5
        ? `rgba(250, 245, 231, ${0.12 + Math.random() * 0.14})`
        : `rgba(104, 92, 68, ${0.06 + Math.random() * 0.13})`;
    ctx.beginPath();
    ctx.moveTo(0, y + (Math.random() - 0.5));
    ctx.lineTo(w, y + (Math.random() - 0.5));
    ctx.stroke();
  }

  // Slubs: the thick irregular threads that make linen linen.
  for (let i = 0; i < Math.round((w * h) / 9000); i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const horizontal = Math.random() > 0.5;
    const len = 14 + Math.random() * 46;
    ctx.lineWidth = 2 + Math.random() * 1.5;
    ctx.strokeStyle = `rgba(252, 248, 236, ${0.12 + Math.random() * 0.16})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(horizontal ? x + len : x, horizontal ? y : y + len);
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [206, 197, 176], spread: 90, alphaMin: 20, alphaMax: 50 });
  vignette(ctx, w, h, 'rgba(76, 64, 44, 0.16)');
};

/** Poured concrete: cloudy, pitted, with a few hairline cracks. */
const concrete: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(190, 187, 179)'],
    [0.5, 'rgb(166, 163, 156)'],
    [1, 'rgb(177, 174, 166)'],
  ]);

  blotches(ctx, w, h, {
    count: 30,
    color: 'rgb(206, 203, 195)',
    minR: 110,
    maxR: 420,
    alpha: 0.3,
  });
  blotches(ctx, w, h, {
    count: 18,
    color: 'rgb(128, 125, 119)',
    minR: 80,
    maxR: 300,
    alpha: 0.24,
  });

  // Air pockets left by the pour.
  for (let i = 0; i < Math.round((w * h) / 2400); i += 1) {
    const r = 0.6 + Math.random() * 2.2;
    ctx.fillStyle = `rgba(74, 71, 66, ${0.1 + Math.random() * 0.28})`;
    ctx.beginPath();
    ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hairline cracks: a short random walk each.
  for (let i = 0; i < 7; i += 1) {
    let x = Math.random() * w;
    let y = Math.random() * h;
    let angle = Math.random() * Math.PI * 2;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(72, 69, 64, ${0.14 + Math.random() * 0.14})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < 40; step += 1) {
      angle += (Math.random() - 0.5) * 0.9;
      x += Math.cos(angle) * 14;
      y += Math.sin(angle) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  fillNoise(ctx, w, h, { tint: [178, 175, 168], spread: 120, alphaMin: 30, alphaMax: 70 });
  vignette(ctx, w, h, 'rgba(52, 50, 46, 0.2)');
};

/** Pale marble: soft clouding with dark veins branching across it. */
const marble: MotifPainter = (ctx, w, h) => {
  linearBase(ctx, w, h, [
    [0, 'rgb(238, 235, 227)'],
    [0.5, 'rgb(224, 220, 210)'],
    [1, 'rgb(231, 227, 217)'],
  ]);

  blotches(ctx, w, h, {
    count: 20,
    color: 'rgb(203, 199, 189)',
    minR: 140,
    maxR: 480,
    alpha: 0.34,
  });

  // Each vein is a wandering polyline drawn three times: a wide soft ghost, a
  // mid stroke, then a thin dark core. That layering is what stops a hand-drawn
  // vein from looking like a pen line.
  const vein = (startX: number, startY: number, drift: number, length: number) => {
    const points: Array<[number, number]> = [];
    let x = startX;
    let y = startY;
    let angle = drift;
    for (let step = 0; step < length; step += 1) {
      angle += (Math.random() - 0.5) * 0.5;
      x += Math.cos(angle) * 22;
      y += Math.sin(angle) * 22;
      points.push([x, y]);
    }
    const trace = (width: number, alpha: number) => {
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(122, 116, 104, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      for (const [px, py] of points) ctx.lineTo(px, py);
      ctx.stroke();
    };
    trace(9, 0.07);
    trace(3.4, 0.11);
    trace(1, 0.2);
  };

  for (let i = 0; i < 5; i += 1) {
    vein(Math.random() * w, Math.random() * h, Math.random() * Math.PI * 2, 40);
    // A shorter branch off roughly the same region keeps veins clustered.
    vein(Math.random() * w, Math.random() * h, Math.random() * Math.PI * 2, 16);
  }

  fillNoise(ctx, w, h, { tint: [230, 226, 216], spread: 70, alphaMin: 16, alphaMax: 40 });
  vignette(ctx, w, h, 'rgba(120, 112, 96, 0.16)');
};

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const SCRATCH_MOTIFS: ScratchMotif[] = [
  ...FOG_COLOURWAYS.map(({ id, label, note, spec, revealTint }) => ({
    id,
    label,
    note,
    group: 'fog' as const,
    paint: fogged(spec),
    revealTint,
  })),
  { id: 'logo-scallop', label: 'Scallop', group: 'logo', note: 'the arch tile', paint: logoScallop },
  { id: 'logo-drops', label: 'Drops', group: 'logo', note: 'the peach mark', paint: logoDrops },
  { id: 'terrazzo', label: 'Terrazzo', group: 'playful', note: 'colour chips', paint: terrazzo },
  { id: 'riso', label: 'Riso', group: 'playful', note: 'halftone overprint', paint: riso },
  { id: 'sherbet', label: 'Sherbet', group: 'playful', note: 'pastel wash', paint: sherbet },
  { id: 'marbled', label: 'Marbled', group: 'playful', note: 'combed endpaper', paint: marbled },
  { id: 'aurora', label: 'Aurora', group: 'playful', note: 'spectral ribbons', paint: aurora },
  { id: 'sea-glass', label: 'Sea glass', group: 'playful', note: 'etched colour', paint: seaGlass },
  { id: 'topo', label: 'Topo', group: 'texture', note: 'adjustable contours', paint: topo },
  { id: 'blueprint', label: 'Blueprint', group: 'texture', note: 'drafting grid', paint: blueprint },
  { id: 'rice-paper', label: 'Rice paper', group: 'texture', note: 'plant fibres', paint: ricePaper },
  ...BRUSHED_COLOURWAYS.map(({ id, label, note, spec }) => ({
    id,
    label,
    note,
    group: 'brushed' as const,
    paint: brushed(spec),
  })),
  { id: 'linen', label: 'Linen', group: 'texture', note: 'woven threads', paint: linen },
  { id: 'concrete', label: 'Concrete', group: 'texture', note: 'pitted, cracked', paint: concrete },
  { id: 'marble', label: 'Marble', group: 'texture', note: 'veined stone', paint: marble },
  { id: 'kraft', label: 'Kraft', group: 'texture', note: 'paper fibres', paint: kraft },
  { id: 'copper', label: 'Copper', group: 'texture', note: 'oxidised leaf', paint: copper },
  { id: 'engraving', label: 'Engraving', group: 'texture', note: 'ink-blue hatch', paint: engraving },
  { id: 'chalkboard', label: 'Chalkboard', group: 'texture', note: 'slate + dust', paint: chalkboard },
];

export const DEFAULT_MOTIF_ID = 'pewter';

export function getMotif(id: string): ScratchMotif {
  return (
    SCRATCH_MOTIFS.find((motif) => motif.id === id) ??
    SCRATCH_MOTIFS.find((motif) => motif.id === DEFAULT_MOTIF_ID) ??
    SCRATCH_MOTIFS[0]
  );
}
