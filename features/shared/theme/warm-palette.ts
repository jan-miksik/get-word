import type { CSSProperties } from 'react';

/**
 * The warm paper palette, as seen from TypeScript.
 *
 * These are references, not values: every colour of this app is written down
 * once, in `styles/tokens.css`, and this module only hands out `var()` handles
 * to it. It used to hold literal hex, as did `--game-*` in
 * `styles/minigames.css` and `GAME_PALETTE` in `TypingStudyCard` — three copies
 * of the same seven colours, kept in sync by hand.
 *
 * Reach for a Tailwind utility (`bg-paper`, `text-ink`, `border-sea`) in new
 * code. This module exists for the two things a utility cannot do: setting a
 * DOM style property from JavaScript, and handing a subtree the `--ob-*` /
 * `--game-*` variables that the hand-written CSS in `styles/panels.css` and
 * `styles/minigames.css` reads.
 *
 * Because these are `var()` strings they only work where CSS resolves them —
 * a style property, a custom property, a className. They cannot be handed to a
 * canvas context or an SVG attribute; use the tokens' hex from
 * `styles/tokens.css` there, or read the computed value.
 */
export const WARM_PALETTE = {
  surface: 'var(--paper)',
  surfaceHover: 'var(--paper-hi)',
  ink: 'var(--ink)',
  inkSoft: 'var(--ink-soft)',
  accent: 'var(--sea)',
  correct: 'var(--green-alt)',
  wrong: 'var(--brick)',
} as const;

/**
 * The palette under the --ob-* names, so the .onboarding-* classes in
 * styles/panels.css (combobox, options, soft text) work unmodified inside any
 * subtree that applies these vars.
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

/**
 * The same palette under the --game-* names. `.game-card` and
 * `.study-ink-scope` already provide these; this is for the exercises that
 * reuse the game CSS (`game-typing-*`, `game-input`, `game-hint-btn`,
 * `game-feedback`) without sitting inside the game frame.
 */
export const gamePaletteVars = {
  '--game-surface': WARM_PALETTE.surface,
  '--game-surface-hover': WARM_PALETTE.surfaceHover,
  '--game-ink': WARM_PALETTE.ink,
  '--game-ink-soft': WARM_PALETTE.inkSoft,
  '--game-accent': WARM_PALETTE.accent,
  '--game-correct': WARM_PALETTE.correct,
  '--game-wrong': WARM_PALETTE.wrong,
} as CSSProperties;
