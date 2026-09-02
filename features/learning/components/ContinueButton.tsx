'use client';

import type { Ref } from 'react';

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
 * The learning flow currently uses the `slab` variant.
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

export type ContinueButtonVariant = 'slab' | 'ink' | 'lift' | 'outline';

const CONTINUE_BUTTON_DEFAULT_VARIANT: ContinueButtonVariant = 'slab';

/** Height, radius, typography and padding — identical for every variant. */
const SHAPE = [
  'inline-flex w-full min-h-14 items-center justify-center gap-2',
  'rounded-[14px] border-2 px-6 py-3',
  'text-[0.95rem] font-black uppercase leading-none tracking-[0.07em]',
  'cursor-pointer select-none touch-manipulation',
  // `scale` and `translate` are named explicitly: Tailwind v4 compiles those
  // utilities to the standalone CSS properties, not to `transform`, so a
  // transform-only transition would leave the press snapping.
  'transition-[background-color,border-color,color,box-shadow,transform,scale,translate] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea',
  'disabled:cursor-default disabled:opacity-45 disabled:shadow-none disabled:translate-y-0 disabled:scale-100',
].join(' ');

/**
 * The press physics: the slab shrinks a little under the thumb instead of
 * dropping onto a hard shadow. 3 % is enough to read as give on a full-width
 * button and small enough that the tap target does not move out from under a
 * finger resting near the edge; below ~6 % it stops being feedback and becomes
 * a jump. Motion is the second signal only — with `prefers-reduced-motion` the
 * fill alone has to carry the press, which is why the active colours are on the
 * skins and not here.
 */
const PRESS = 'active:scale-[0.97] motion-reduce:active:scale-100';
const PRESSED = '!scale-[0.97] motion-reduce:!scale-100';

type VariantSkin = {
  /** Resting appearance plus the real hover/active pseudo-states. */
  base: string;
  /** What `:active` looks like, for the dev preview to freeze. */
  pressed: string;
};

const SKINS: Record<ContinueButtonVariant, VariantSkin> = {
  // Cream slab with a thick ink border that fills on press — the `.srs-btn`
  // treatment the "Umím / Nevím" row already uses, which is the row this button
  // literally replaces in `WordCard`. Neobrutalist without the hard offset
  // shadow, so nothing on the card floats; the press is carried by the fill
  // plus a small shrink instead (see `PRESS`).
  slab: {
    base: [
      // The edge is true black and stays black through hover and press: it is
      // the outline of the control, not one more state to read. Only the fill
      // moves. Warm ink (`border-ink`) drawn on the study surface's cream
      // gradient reads as a slightly darker patch of paper rather than as a
      // line, which is why this one border leaves the warm scale.
      'border-ink-black bg-paper text-ink shadow-none',
      'hover:bg-sea hover:text-paper',
      `active:bg-sea active:text-paper ${PRESS}`,
    ].join(' '),
    pressed: `!bg-sea !text-paper ${PRESSED}`,
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
  // `slab` before the press physics: the border turns sea on hover as well, and
  // the press is colour only. Kept as the still comparison.
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
  hint,
  className = '',
  showArrow = true,
  forcePressed = false,
  buttonRef,
}: {
  variant?: ContinueButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  /** Defaults to the translated `card.continue`. */
  label?: string;
  /**
   * A quiet second line under the label — the typing card's "and then in three
   * days". It is a promise about the card being left behind, so it belongs on
   * the control that leaves it rather than somewhere else on the card.
   */
  hint?: string;
  /** Layout only — width, margins, position. Never the skin. */
  className?: string;
  /**
   * The trailing arrow, on by default. Off for the rare label that is not a
   * "carry on through the deck" — "Add words" opens a side errand, and the
   * arrow read as if it were the next card.
   */
  showArrow?: boolean;
  /** Dev preview only: freeze the `:active` look so it can be compared. */
  forcePressed?: boolean;
  /** For cards that move focus here once an answer is in. */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useI18n();
  const skin = SKINS[variant] ?? SKINS[CONTINUE_BUTTON_DEFAULT_VARIANT];
  const text = label ?? t('card.continue');

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-continue-variant={variant}
      className={[
        SHAPE,
        // The hint turns the row of children into two stacked lines. The
        // button's own height, radius and type are untouched — that is the
        // whole point of this component.
        hint ? 'flex-col !gap-1' : '',
        skin.base,
        forcePressed && !disabled ? skin.pressed : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="inline-flex items-center gap-2">
        <span>{text}</span>
        {showArrow ? <span aria-hidden="true">→</span> : null}
      </span>
      {hint ? (
        <span className="text-[0.58rem] font-bold normal-case leading-none tracking-[0.06em] opacity-60">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
