'use client';

import { useSyncExternalStore } from 'react';

/**
 * The success badge varies along two independent axes.
 *
 * `animation` is how it arrives; `skin` is what it is made of — colour, border
 * weight, tick weight. Keeping them apart means five looks and five entrances
 * cover twenty-five combinations without twenty-five definitions, and either
 * axis can be pinned while the other stays random.
 */
export const SUCCESS_MARK_ANIMATIONS = ['pop', 'stamp', 'drop', 'draw', 'bloom'] as const;

export const SUCCESS_MARK_SKINS = ['green', 'solid', 'ink', 'gold', 'accent'] as const;

export type SuccessMarkAnimation = (typeof SUCCESS_MARK_ANIMATIONS)[number];
export type SuccessMarkSkin = (typeof SUCCESS_MARK_SKINS)[number];

/** Either axis can be left to chance; each badge then rolls its own on mount. */
export type SuccessMarkChoice<T> = T | 'random';

/**
 * Both axes are still open, so every completed card rolls its own combination
 * on mount — a different badge each time rather than one house style.
 */
export const DEFAULT_ANIMATION_CHOICE: SuccessMarkChoice<SuccessMarkAnimation> = 'random';
export const DEFAULT_SKIN_CHOICE: SuccessMarkChoice<SuccessMarkSkin> = 'random';

/** Fallbacks for the server, where rolling dice would break hydration. */
export const FALLBACK_ANIMATION: SuccessMarkAnimation = 'pop';
export const FALLBACK_SKIN: SuccessMarkSkin = 'solid';

const ANIMATION_KEY = 'get-word-success-mark';
const SKIN_KEY = 'get-word-success-mark-skin';
/** Same-tab notification; `storage` only fires in the *other* tabs. */
const CHANGE_EVENT = 'get-word-success-mark-change';

function read<T extends string>(key: string, allowed: readonly T[], fallback: SuccessMarkChoice<T>): SuccessMarkChoice<T> {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === 'random') return 'random';
    return allowed.includes((stored ?? '') as T) ? (stored as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private-mode storage failures only cost the override, not the badge.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readAnimationChoice(): SuccessMarkChoice<SuccessMarkAnimation> {
  return read(ANIMATION_KEY, SUCCESS_MARK_ANIMATIONS, DEFAULT_ANIMATION_CHOICE);
}

export function readSkinChoice(): SuccessMarkChoice<SuccessMarkSkin> {
  return read(SKIN_KEY, SUCCESS_MARK_SKINS, DEFAULT_SKIN_CHOICE);
}

export function writeAnimationChoice(choice: SuccessMarkChoice<SuccessMarkAnimation>): void {
  write(ANIMATION_KEY, choice);
}

export function writeSkinChoice(choice: SuccessMarkChoice<SuccessMarkSkin>): void {
  write(SKIN_KEY, choice);
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
 * What every badge should render right now. A picker — currently only
 * `/dev/success-mark` — writes the overrides, and because the `storage` event
 * crosses tabs, a running study session in another tab picks them up live.
 */
export function useSuccessMarkAnimationChoice(): SuccessMarkChoice<SuccessMarkAnimation> {
  return useSyncExternalStore(subscribe, readAnimationChoice, () => FALLBACK_ANIMATION);
}

export function useSuccessMarkSkinChoice(): SuccessMarkChoice<SuccessMarkSkin> {
  return useSyncExternalStore(subscribe, readSkinChoice, () => FALLBACK_SKIN);
}

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
