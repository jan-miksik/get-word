'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * Shared "Continue" affordance for learning cards.
 *
 * The post-answer continue is currently redrawn in every card that needs one —
 * a bare arrow in the exercise card, a smaller bare arrow wedged next to the
 * feedback line in word assembly, a pill in the similar-words card, a full
 * width bar in the minigame overlay. They differ in height, radius, padding and
 * whether they carry a label at all, and several are below a comfortable thumb
 * target.
 *
 * This component fixes the geometry — height, radius, typography, padding —
 * and leaves only the *skin* to the variant, so the variants stay honestly
 * comparable and any of them can drop into any card without per-card tuning.
 *
 * The learning flow currently uses the `solid` variant.
 *
 * The colours come from the paper-palette utilities (`bg-sea`, `text-paper`,
 * `border-ink`), never from `--accent` / `--text`. Games and study cards re-map
 * those two inside their own scopes (`.game-card`, `.study-ink-scope`), so a
 * button built on them would change colour from card to card — which is the
 * inconsistency this component ends. The palette tokens are never re-pointed by
 * a scope, so they hold on every surface; see CLAUDE.md → Styling → Design
 * tokens. This used to be written out as literal hex for the same reason, back
 * when those stable names did not exist.
 */

export type ContinueButtonVariant = 'solid' | 'ink' | 'lift' | 'outline';

const CONTINUE_BUTTON_DEFAULT_VARIANT: ContinueButtonVariant = 'solid';

/** Height, radius, typography and padding — identical for every variant. */
const SHAPE = [
  'inline-flex w-full min-h-14 items-center justify-center gap-2',
  'rounded-[14px] border-2 px-6 py-3',
  'text-[0.95rem] font-black uppercase leading-none tracking-[0.07em]',
  'cursor-pointer select-none touch-manipulation',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea',
  'disabled:cursor-default disabled:opacity-45 disabled:shadow-none disabled:translate-y-0',
].join(' ');

type VariantSkin = {
  /** Resting appearance plus the real hover/active pseudo-states. */
  base: string;
  /** What `:active` looks like, for the dev preview to freeze. */
  pressed: string;
};

const SKINS: Record<ContinueButtonVariant, VariantSkin> = {
  // Flat accent fill — the same treatment as `.onboarding-option-highlight`.
  solid: {
    base: [
      'border-sea bg-sea text-paper shadow-none',
      'hover:border-sea-mid hover:bg-sea-mid',
      'active:translate-y-px active:border-sea-deep active:bg-sea-deep',
    ].join(' '),
    pressed: '!translate-y-px !border-sea-deep !bg-sea-deep',
  },
  // Dark ink bar — matches the typing card's continue and the minigame overlay,
  // and reads as "advance the session" rather than "another answer".
  ink: {
    base: [
      'border-ink bg-ink text-paper shadow-none',
      'hover:border-ink-600 hover:bg-ink-600',
      'active:translate-y-px active:border-ink-900 active:bg-ink-900',
    ].join(' '),
    pressed: '!translate-y-px !border-ink-900 !bg-ink-900',
  },
  // Hard bottom shadow that presses down — the same physical feel as the
  // multiple-choice options, so the continue belongs to the same toy.
  lift: {
    base: [
      'border-sea bg-sea text-paper shadow-[0_4px_0_var(--sea-deep)]',
      'hover:-translate-y-0.5 hover:shadow-[0_6px_0_var(--sea-deep)]',
      'active:translate-y-[3px] active:shadow-none',
    ].join(' '),
    pressed: '!translate-y-[3px] !shadow-none',
  },
  // Cream with an ink border that fills on press — the `.srs-btn` treatment,
  // quiet enough to sit under a card that already shows a success mark.
  outline: {
    base: [
      'border-ink bg-paper text-ink shadow-none',
      'hover:border-sea hover:bg-sea hover:text-paper',
      'active:border-sea active:bg-sea active:text-paper',
    ].join(' '),
    pressed: '!border-sea !bg-sea !text-paper',
  },
};

/**
 * The button geometry and skin on their own, for the rare sibling action that
 * shares this slot without being a continue — the assembly card's "check",
 * which sits in exactly the same place and is replaced by the real continue the
 * moment it is pressed. Anything that *does* advance the session should render
 * `ContinueButton` instead of borrowing these classes.
 */
export function studyActionClasses(
  variant: ContinueButtonVariant = CONTINUE_BUTTON_DEFAULT_VARIANT,
): string {
  return `${SHAPE} ${(SKINS[variant] ?? SKINS[CONTINUE_BUTTON_DEFAULT_VARIANT]).base}`;
}

export function ContinueButton({
  variant = CONTINUE_BUTTON_DEFAULT_VARIANT,
  onClick,
  disabled = false,
  label,
  className = '',
  forcePressed = false,
}: {
  variant?: ContinueButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  /** Defaults to the translated `card.continue`. */
  label?: string;
  /** Layout only — width, margins, position. Never the skin. */
  className?: string;
  /** Dev preview only: freeze the `:active` look so it can be compared. */
  forcePressed?: boolean;
}) {
  const { t } = useI18n();
  const skin = SKINS[variant] ?? SKINS[CONTINUE_BUTTON_DEFAULT_VARIANT];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-continue-variant={variant}
      className={[SHAPE, skin.base, forcePressed && !disabled ? skin.pressed : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label ?? t('card.continue')}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
