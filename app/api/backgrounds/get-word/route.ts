import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const BACKGROUND_PATH = join(process.cwd(), 'public', 'backgrounds', 'bg-get-word.svg');
const SEEDED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const RANDOM_CACHE_CONTROL = 'no-store';
const ERROR_CACHE_CONTROL = 'no-store';
const DEVELOPMENT_FRAME_COLOR = '#1E6FA8';
const PRODUCTION_HOSTNAMES = new Set(['getword.app', 'www.getword.app']);

const BASE_SCALE = 7;
const BASE_TX = 891.6003;
const BASE_TY = 448.02314;
const SCALE_JITTER = 2.4;
const TX_JITTER = 600;
const TY_JITTER = 480;

let backgroundSvgPromise: Promise<string> | null = null;

async function readBackgroundSvg(): Promise<string> {
  try {
    return await readFile(BACKGROUND_PATH, 'utf8');
  } catch (error) {
    backgroundSvgPromise = null;
    throw error;
  }
}

function getBackgroundSvg(): Promise<string> {
  backgroundSvgPromise ??= readBackgroundSvg();
  return backgroundSvgPromise;
}

function seedToUint32(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = seedToUint32(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function replaceSnowflakesPattern(
  svgText: string,
  replacer: (patternBlock: string) => string
): string {
  return svgText.replace(
    /<pattern\b[^>]*\bid="Snowflakes"[^>]*>[\s\S]*?<\/pattern>/,
    replacer
  );
}

function mutateBackgroundSvg(svgText: string, seed: string): string {
  const random = createSeededRandom(seed);

  const scale = BASE_SCALE + (random() - 0.5) * SCALE_JITTER;
  const tx = BASE_TX + (random() - 0.5) * TX_JITTER;
  const ty = BASE_TY + (random() - 0.5) * TY_JITTER;

  const matrix = `matrix(${scale.toFixed(4)},0,0,${scale.toFixed(4)},${tx.toFixed(4)},${ty.toFixed(4)})`;
  const translate = `translate(${tx.toFixed(4)},${ty.toFixed(4)})`;

  return svgText
    .replace(
      /(id="pattern31"[\s\S]*?patternTransform=")matrix\([^"]+\)"/,
      `$1${matrix}"`
    )
    .replace(
      /<pattern\b[^>]*\bid="Snowflakes"[^>]*>[\s\S]*?<\/pattern>/,
      (patternBlock) =>
        patternBlock.replace(
          /(patternTransform=")translate\([^"]+\)"/,
          `$1${translate}"`
        )
    );
}

function colorizeFramePattern(svgText: string, color: string): string {
  return replaceSnowflakesPattern(
    svgText,
    (patternBlock) =>
      patternBlock.replace(/style="([^"]*)"/g, (_match, style: string) => {
        const nextStyle = /(?:^|;)fill\s*:/.test(style)
          ? style.replace(/(^|;)fill\s*:\s*#[0-9A-Fa-f]{6}/, `$1fill:${color}`)
          : `fill:${color};${style}`;

        return `style="${nextStyle}"`;
      })
  );
}

function usesDevelopmentFrame(request: NextRequest): boolean {
  if (request.nextUrl.searchParams.get('frame') === 'development') return true;

  const hostname = request.nextUrl.hostname.toLowerCase();
  return !PRODUCTION_HOSTNAMES.has(hostname);
}

export async function GET(request: NextRequest) {
  try {
    const explicitSeed = request.nextUrl.searchParams.get('seed');
    const useDevelopmentFrame = usesDevelopmentFrame(request);
    const seed = explicitSeed ?? randomUUID();
    const svg = await getBackgroundSvg();
    const frameSvg = useDevelopmentFrame
      ? colorizeFramePattern(svg, DEVELOPMENT_FRAME_COLOR)
      : svg;
    const randomizedSvg = mutateBackgroundSvg(frameSvg, seed);

    return new Response(randomizedSvg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': explicitSeed ? SEEDED_CACHE_CONTROL : RANDOM_CACHE_CONTROL,
      },
    });
  } catch {
    return new Response('Failed to generate background', {
      status: 500,
      headers: {
        'Cache-Control': ERROR_CACHE_CONTROL,
      },
    });
  }
}
