'use client';

import { getMotif } from './motifs';

/**
 * What the scratch field is currently made of. A module-level store rather than
 * React state because several independent surfaces read it — the cover, the
 * layer beneath it, the rising letters, the landing page and the loading screen
 * — and none of them owns the others.
 *
 * TEMPORARY: exists to support the experiment's switcher. Once a combination is
 * chosen this and {@link components/ScratchFieldSwitcher} both go away and the
 * config becomes a constant.
 */

/** The layer painted under the cover. `none` leaves the page's own background
 *  (parchment, or the loader's cream) showing through instead. */
export const NO_BASE = 'none';

export type ScratchFieldConfig = {
  /** The motif you scratch away. */
  cover: string;
  /** The motif revealed underneath, or {@link NO_BASE}. */
  base: string;
  /** Which of the two the rising letters float above. */
  letters: 'base' | 'cover';
  /** Pattern spacing for Topo and the parameterised experimental motifs. */
  textureDensity: number;
  /** Brush radius in CSS pixels for mouse/trackpad-sized layouts. */
  desktopBrushRadius: number;
  /** Smaller brush radius for phones and coarse pointers. */
  mobileBrushRadius: number;
};

const STORAGE_KEY = 'get-word-scratch-config';

const DEFAULT_CONFIG: ScratchFieldConfig = {
  // The chosen combination: contours you rub away to find colour chips
  // underneath. Anyone who has already picked something in the switcher keeps
  // their stored choice; this only affects fresh visitors.
  cover: 'topo',
  base: 'terrazzo',
  letters: 'base',
  textureDensity: 0.4,
  desktopBrushRadius: 62,
  mobileBrushRadius: 32,
};

const listeners = new Set<() => void>();
let config: ScratchFieldConfig | null = null;
let repaintCount = 0;
let snapshot: string | null = null;

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalise(raw: Partial<ScratchFieldConfig> | null): ScratchFieldConfig {
  if (!raw) return DEFAULT_CONFIG;
  return {
    cover: getMotif(raw.cover ?? DEFAULT_CONFIG.cover).id,
    base: raw.base === NO_BASE || !raw.base ? NO_BASE : getMotif(raw.base).id,
    letters: raw.letters === 'cover' ? 'cover' : 'base',
    textureDensity: clampNumber(raw.textureDensity, DEFAULT_CONFIG.textureDensity, 0.35, 1.6),
    desktopBrushRadius: clampNumber(
      raw.desktopBrushRadius,
      DEFAULT_CONFIG.desktopBrushRadius,
      28,
      96
    ),
    mobileBrushRadius: clampNumber(
      raw.mobileBrushRadius,
      DEFAULT_CONFIG.mobileBrushRadius,
      16,
      64
    ),
  };
}

function read(): ScratchFieldConfig {
  if (config !== null) return config;
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    config = normalise(stored ? JSON.parse(stored) : null);
  } catch {
    config = DEFAULT_CONFIG;
  }
  return config;
}

/** The snapshot carries the whole config plus a repaint counter, so "repaint
 *  with the same settings" is still a changed value and still re-runs the
 *  painters (every motif is randomised, so a repaint is a new surface). */
function computeSnapshot(): string {
  const c = read();
  return [
    c.cover,
    c.base,
    c.letters,
    c.textureDensity,
    c.desktopBrushRadius,
    c.mobileBrushRadius,
  ].join('|') + `#${repaintCount}`;
}

function emit() {
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeScratchConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Cached so `useSyncExternalStore` sees a stable reference between changes. */
export function getScratchSnapshot(): string {
  if (snapshot === null) snapshot = computeSnapshot();
  return snapshot;
}

/** SSR/hydration snapshot: always the default, so the server and the first
 *  client render agree before localStorage is consulted. */
export function getScratchServerSnapshot(): string {
  const c = DEFAULT_CONFIG;
  return [
    c.cover,
    c.base,
    c.letters,
    c.textureDensity,
    c.desktopBrushRadius,
    c.mobileBrushRadius,
  ].join('|') + '#0';
}

export function configFromSnapshot(value: string): ScratchFieldConfig {
  const [cover, base, letters, textureDensity, desktopBrushRadius, mobileBrushRadius] =
    value.split('#')[0].split('|');
  return normalise({
    cover,
    base,
    letters: letters === 'cover' ? 'cover' : 'base',
    textureDensity: Number(textureDensity),
    desktopBrushRadius: Number(desktopBrushRadius),
    mobileBrushRadius: Number(mobileBrushRadius),
  });
}

export function setScratchConfig(patch: Partial<ScratchFieldConfig>) {
  const next = normalise({ ...read(), ...patch });
  const current = read();
  if (
    next.cover === current.cover &&
    next.base === current.base &&
    next.letters === current.letters &&
    next.textureDensity === current.textureDensity &&
    next.desktopBrushRadius === current.desktopBrushRadius &&
    next.mobileBrushRadius === current.mobileBrushRadius
  ) {
    return;
  }
  config = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The choice is a nicety; ignore storage failures.
  }
  emit();
}

/** Force every mounted surface to repaint without changing the config. */
export function repaintScratchFields() {
  repaintCount += 1;
  emit();
}
