/**
 * The success badge has one permanent appearance and several entrances.
 *
 * The skin list remains available to the development gallery, but study UI
 * always uses `solid`. The gallery passes explicit props to its samples; it
 * must never persist a setting that can alter a learner's study session.
 */
export const SUCCESS_MARK_ANIMATIONS = ['pop', 'stamp', 'drop', 'draw', 'bloom'] as const;

export const SUCCESS_MARK_SKINS = ['green', 'solid', 'ink', 'gold', 'accent'] as const;

export type SuccessMarkAnimation = (typeof SUCCESS_MARK_ANIMATIONS)[number];
export type SuccessMarkSkin = (typeof SUCCESS_MARK_SKINS)[number];

/** Used only when an explicit development-gallery prop is invalid. */
export const FALLBACK_ANIMATION: SuccessMarkAnimation = 'pop';
export const FALLBACK_SKIN: SuccessMarkSkin = 'solid';

export function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
