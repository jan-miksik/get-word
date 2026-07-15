import type { CSSProperties } from 'react';

/**
 * The warm beige surface palette used by onboarding and the study games.
 * Values intentionally mirror GAME_PALETTE (TypingStudyCard) and the --ob-*
 * variables in styles/panels.css; those older copies stay untouched for now.
 */
export const WARM_PALETTE = {
  surface: '#F4EFE2',
  surfaceHover: '#FFF8E8',
  ink: '#2A2218',
  inkSoft: '#6B5E48',
  accent: '#1E6FA8',
  correct: '#15803D',
  wrong: '#B91C1C',
} as const;

/**
 * The palette as CSS custom properties under the --ob-* names, so the
 * .onboarding-* classes in styles/panels.css (combobox, options, soft text)
 * work unmodified inside any subtree that applies these vars.
 */
export const warmPaletteVars = {
  '--ob-surface': WARM_PALETTE.surface,
  '--ob-surface-hover': WARM_PALETTE.surfaceHover,
  '--ob-ink': WARM_PALETTE.ink,
  '--ob-ink-soft': WARM_PALETTE.inkSoft,
  '--ob-accent': WARM_PALETTE.accent,
  '--ob-correct': WARM_PALETTE.correct,
  '--ob-wrong': WARM_PALETTE.wrong,
} as CSSProperties;
