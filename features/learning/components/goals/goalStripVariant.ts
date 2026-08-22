'use client';

import { useSyncExternalStore } from 'react';

/**
 * How the goal strip draws its progress.
 *
 * `tide` fills left to right under a slow sheen. `ring` wraps the countdown
 * number in a stroke that closes as the day does. `sand` draws the two
 * quantities against each other — time left of the plan against work left to do
 * — so the gap between the edges is literally "ahead" or "behind".
 */
export const GOAL_STRIP_VARIANTS = ['tide', 'ring', 'sand'] as const;

export type GoalStripVariant = (typeof GOAL_STRIP_VARIANTS)[number];

export const DEFAULT_GOAL_STRIP_VARIANT: GoalStripVariant = 'tide';

const STORAGE_KEY = 'get-word-goal-strip';
/** Same-tab notification; `storage` only fires in the *other* tabs. */
const CHANGE_EVENT = 'get-word-goal-strip-change';

export function readGoalStripVariant(): GoalStripVariant {
  if (typeof window === 'undefined') return DEFAULT_GOAL_STRIP_VARIANT;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return GOAL_STRIP_VARIANTS.includes((stored ?? '') as GoalStripVariant)
      ? (stored as GoalStripVariant)
      : DEFAULT_GOAL_STRIP_VARIANT;
  } catch {
    return DEFAULT_GOAL_STRIP_VARIANT;
  }
}

export function writeGoalStripVariant(variant: GoalStripVariant): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // Private-mode storage failures only cost the override, not the strip.
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
 * What the strip should render right now. A picker — currently only
 * `/dev/study-goal` — writes the override, and because the `storage` event
 * crosses tabs, a running study session in another tab picks it up live.
 */
export function useGoalStripVariant(): GoalStripVariant {
  return useSyncExternalStore(subscribe, readGoalStripVariant, () => DEFAULT_GOAL_STRIP_VARIANT);
}
