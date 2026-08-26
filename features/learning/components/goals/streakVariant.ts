'use client';

import { useSyncExternalStore } from 'react';

/**
 * How the study series draws itself.
 *
 * `bars` reads each day as a lane filled from the bottom, so a partial day
 * shows exactly how much was missing. `chain` makes the series literal: kept
 * days are links joined to their neighbours and a miss is a visible break.
 * `ring` wraps the week around the count. `trail` drops the single week for six
 * of them, trading detail for the long arc. `steps` climbs, so a run reads as
 * ground gained rather than as attendance.
 *
 * The four after those deliberately leave the session-rail vocabulary behind —
 * this number is looked at rather than glanced at, and the house style was
 * capping how interesting it could be. `wave` draws the week as one profile,
 * `pulse` as a heartbeat, `comet` as a moving head with a fading tail, and
 * `stack` gives the run actual mass.
 */
export const STREAK_VARIANTS = [
  'bars', 'chain', 'ring', 'trail', 'steps',
  'wave', 'pulse', 'comet', 'stack',
] as const;

export type StreakVariant = (typeof STREAK_VARIANTS)[number];

const DEFAULT_STREAK_VARIANT: StreakVariant = 'chain';

const STORAGE_KEY = 'get-word-streak-variant';
/** Same-tab notification; `storage` only fires in the *other* tabs. */
const CHANGE_EVENT = 'get-word-streak-variant-change';

function readStreakVariant(): StreakVariant {
  if (typeof window === 'undefined') return DEFAULT_STREAK_VARIANT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return STREAK_VARIANTS.includes((stored ?? '') as StreakVariant)
      ? (stored as StreakVariant)
      : DEFAULT_STREAK_VARIANT;
  } catch {
    return DEFAULT_STREAK_VARIANT;
  }
}

export function writeStreakVariant(variant: StreakVariant): void {
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
 * What the series should render right now. A picker — currently only
 * `/dev/study-goal` — writes the override, and because the `storage` event
 * crosses tabs, a running study session in another tab picks it up live.
 */
export function useStreakVariant(): StreakVariant {
  return useSyncExternalStore(subscribe, readStreakVariant, () => DEFAULT_STREAK_VARIANT);
}
