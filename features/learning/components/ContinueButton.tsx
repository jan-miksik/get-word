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
 * The learning flow currently uses the `solid` variant. `/dev/continue-button`
 * keeps the other skins available for side-by-side comparison.
 *
 * The palette is written out in literal hex rather than taken from `--accent` /
 * `--text` on purpose. Games and study cards re-map those tokens inside their
 * own scopes (`.game-card`, `.study-ink-scope`), so a token-driven button would
 * change colour from card to card — which is the inconsistency this ends. The
 * literals also keep every class statically visible to the Tailwind scanner.
 */

export const CONTINUE_BUTTON_VARIANTS = ['solid', 'ink', 'lift', 'outline'] as const;

export type ContinueButtonVariant = (typeof CONTINUE_BUTTON_VARIANTS)[number];

export const CONTINUE_BUTTON_DEFAULT_VARIANT: ContinueButtonVariant = 'solid';

/** Height, radius, typography and padding — identical for every variant. */
const SHAPE = [
  'inline-flex w-full min-h-14 items-center justify-center gap-2',
  'rounded-[14px] border-2 px-6 py-3',
  'text-[0.95rem] font-black uppercase leading-none tracking-[0.07em]',
  'cursor-pointer select-none touch-manipulation',
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E6FA8]',
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
      'border-[#1E6FA8] bg-[#1E6FA8] text-[#F4EFE2] shadow-none',
      'hover:border-[#17608F] hover:bg-[#17608F]',
      'active:translate-y-px active:border-[#14547F] active:bg-[#14547F]',
    ].join(' '),
    pressed: '!translate-y-px !border-[#14547F] !bg-[#14547F]',
  },
  // Dark ink bar — matches the typing card's continue and the minigame overlay,
  // and reads as "advance the session" rather than "another answer".
  ink: {
    base: [
      'border-[#2A2218] bg-[#2A2218] text-[#F4EFE2] shadow-none',
      'hover:border-[#3D3226] hover:bg-[#3D3226]',
      'active:translate-y-px active:border-[#171208] active:bg-[#171208]',
    ].join(' '),
    pressed: '!translate-y-px !border-[#171208] !bg-[#171208]',
  },
  // Hard bottom shadow that presses down — the same physical feel as the
  // multiple-choice options, so the continue belongs to the same toy.
  lift: {
    base: [
      'border-[#1E6FA8] bg-[#1E6FA8] text-[#F4EFE2] shadow-[0_4px_0_#14547F]',
      'hover:-translate-y-0.5 hover:shadow-[0_6px_0_#14547F]',
      'active:translate-y-[3px] active:shadow-none',
    ].join(' '),
    pressed: '!translate-y-[3px] !shadow-none',
  },
  // Cream with an ink border that fills on press — the `.srs-btn` treatment,
  // quiet enough to sit under a card that already shows a success mark.
  outline: {
    base: [
      'border-[#2A2218] bg-[#F4EFE2] text-[#2A2218] shadow-none',
      'hover:border-[#1E6FA8] hover:bg-[#1E6FA8] hover:text-[#F4EFE2]',
      'active:border-[#1E6FA8] active:bg-[#1E6FA8] active:text-[#F4EFE2]',
    ].join(' '),
    pressed: '!border-[#1E6FA8] !bg-[#1E6FA8] !text-[#F4EFE2]',
  },
};

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
