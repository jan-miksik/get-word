'use client';

import { useSyncExternalStore } from 'react';

/**
 * How "today" is called out inside the chain streak — the shape actually
 * shipped to real learners (the others live only on `/dev/study-goal`).
 *
 * `halo` is the shipped default: a translucent ring in the day's own colour,
 * drawn behind the bead. `solid` is the same ring made opaque instead of
 * faded, so it does not have to compete with the neighbouring rings that mark
 * planned-but-undecided days. `pulse` keeps the solid ring but breathes it, so
 * motion — not contrast — is what says "now" (still than a still picture
 * under `prefers-reduced-motion`). `ink` drops the day's own colour from the
 * ring entirely and draws it in plain ink, so today reads as a UI marker —
 * "you are here" — rather than as one more status colour to learn. `border`
 * is `ink` reduced to its plainest possible form: a flat 2px black line at
 * full opacity, no glow — the answer to "what if it were just a border".
 * `pin` drops the ring altogether and hangs a small marker above the bead
 * instead, so today is found by shape rather than by spotting the one ring
 * that looks slightly different from the rest. `diamond` breaks the shape
 * language on purpose:
 * every other day is a circle, today alone is a diamond outline around the
 * bead, so it cannot be missed by anyone not consciously comparing shades.
 * `orbit` gives today a small satellite that circles the bead forever — the
 * one variant where "now" is a little planet with a moon rather than a
 * marking on a bead at all.
 *
 * The last four all read as some kind of viewfinder or gunsight rather than a
 * ring, chasing the same idea from different reference points: `crosshair`
 * keeps `border`'s own ring and adds a gapped "+" through it, like an optical
 * reticle. `ticks` swaps that "+" for four short marks at the cardinal
 * points around the ring, like a compass. `target` drops today's ring for
 * two concentric ones, like a bullseye. `viewfinder` drops the ring
 * altogether for four corner brackets traced snug against the bead, like a
 * camera focusing on it.
 */
export const TODAY_MARK_VARIANTS = [
  'halo', 'solid', 'pulse', 'ink', 'border',
  'pin', 'diamond', 'orbit', 'crosshair', 'ticks', 'target', 'viewfinder',
] as const;

export type TodayMarkVariant = (typeof TODAY_MARK_VARIANTS)[number];

const DEFAULT_TODAY_MARK: TodayMarkVariant = 'halo';

const STORAGE_KEY = 'get-word-today-mark-variant';
/** Same-tab notification; `storage` only fires in the *other* tabs. */
const CHANGE_EVENT = 'get-word-today-mark-variant-change';

function readTodayMarkVariant(): TodayMarkVariant {
  if (typeof window === 'undefined') return DEFAULT_TODAY_MARK;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return TODAY_MARK_VARIANTS.includes((stored ?? '') as TodayMarkVariant)
      ? (stored as TodayMarkVariant)
      : DEFAULT_TODAY_MARK;
  } catch {
    return DEFAULT_TODAY_MARK;
  }
}

export function writeTodayMarkVariant(variant: TodayMarkVariant): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // Private-mode storage failures only cost the override, not the series.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * What today's mark should look like right now. A picker — currently only
 * `/dev/study-goal` — writes the override, and because the `storage` event
 * crosses tabs, a running study session in another tab picks it up live.
 */
export function useTodayMarkVariant(): TodayMarkVariant {
  return useSyncExternalStore(subscribe, readTodayMarkVariant, () => DEFAULT_TODAY_MARK);
}
