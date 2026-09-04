'use client';

import type { CSSProperties, ReactNode } from 'react';
import { noTranslateProps } from '@/lib/i18n/no-translate';

/**
 * The one answer button of the study flow.
 *
 * Choice and matching used to draw the same thing twice: choice built the
 * paper-card look inline with Tailwind, matching kept an older flat variant in
 * `.game-match-btn`, and the two drifted — different radius, different border
 * weight, a coloured fill on selection in one and a lift in the other. Every
 * option the learner can tap now comes from here, so a round of matching reads
 * like a round of choice.
 *
 * States, in the order a round tends to walk through them:
 *   idle    — untouched, liftable
 *   selected— picked, waiting for its partner (matching only)
 *   correct — right answer, just chosen
 *   matched — right answer, already settled into the board (matching only)
 *   wrong   — wrong answer, just chosen
 *   reveal  — the right answer, pointed out after a wrong pick
 */
export type StudyOptionState =
  | 'idle'
  | 'selected'
  | 'correct'
  | 'matched'
  | 'wrong'
  | 'reveal';

/** Fewer options on screen means each one can carry more type. */
export type StudyOptionSize = 'lg' | 'md' | 'sm';

/** Which pair a settled matching button belongs to. */
export type StudyOptionMatchColor = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Phones get a smaller step of every size.
 *
 * A board of eight options at the desktop size is taller than a short phone's
 * study area, so the round arrived already scrolled — and an answer you have to
 * scroll to find is an answer you did not choose between. The sizes below the
 * `sm` breakpoint are one notch down across the board; from `sm` up nothing
 * changed, since there the height was never the constraint.
 */
const sizeClasses: Record<StudyOptionSize, string> = {
  lg: 'min-h-16 px-3 py-3 text-lg sm:min-h-24 sm:px-4 sm:py-4 sm:text-2xl',
  md: 'min-h-14 px-2.5 py-2.5 text-base sm:min-h-16 sm:px-3 sm:py-3 sm:text-xl',
  sm: 'min-h-12 px-2 py-2 text-sm sm:min-h-14 sm:px-3 sm:py-2.5 sm:text-lg',
};

const stateClasses: Record<StudyOptionState, string> = {
  idle:
    'border-grey-line bg-paper-hi text-ink shadow-[0_3px_0_#D8C9AF] ' +
    'hover:-translate-y-0.5 hover:border-sea hover:shadow-[0_5px_0_#C7B89E] ' +
    'active:translate-y-[2px] active:shadow-none',
  // A picked half stays paper and lifts instead of filling with cold blue: the
  // board sits on warm sand, and a flat blue slab read as a foreign element.
  selected:
    '-translate-y-0.5 border-sea bg-paper-hi text-sea-mid ' +
    'shadow-[0_5px_0_#B9CFE0] ring-2 ring-sea/15',
  correct:
    'scale-[1.025] border-moss bg-wash-moss text-[#145B33] shadow-[0_4px_0_#A9D3B6] ' +
    'motion-safe:animate-[pulse_420ms_ease-out_1]',
  // A settled pair carries its own colour; what is left in play stays plain
  // cream, so the board reads as "collected vs still open" at a glance.
  // Everything colourful (wash, border) is inline, keyed off the pair's hue —
  // the fixed green border used to fight whatever tint the pair drew. The
  // class values are the fallback for a settled button with no colour.
  matched: 'border-paper-edge bg-[#F6EEDE] text-ink shadow-[0_2px_0_#DCCFB6]',
  wrong:
    'border-brick bg-wash-brick text-brick-deep shadow-[0_3px_0_#E4AAA6] ' +
    'motion-safe:animate-[game-shake_350ms_ease]',
  reveal: 'border-moss bg-[#F1F7ED] text-moss shadow-none',
};

export function StudyOptionButton({
  state,
  size = 'md',
  matchColor,
  /** Matching's board wants a tighter, less bubbly corner than choice's; every
   * other caller keeps the default. */
  radiusClassName = 'rounded-2xl',
  disabled = false,
  onClick,
  ariaLabel,
  className = '',
  style,
  children,
  ...rest
}: {
  state: StudyOptionState;
  size?: StudyOptionSize;
  /** Tints a `matched` button so both halves of one pair share a colour. */
  matchColor?: StudyOptionMatchColor;
  radiusClassName?: string;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<`data-${string}`, string | number | undefined>) {
  const hue = state === 'matched' && matchColor ? `var(--match-${matchColor})` : null;
  // The wash is layered over the card's cream rather than replacing the fill.
  // Painting a translucent tint straight onto the button let the sand page
  // show through, which turned every settled pair the same muddy grey.
  const matchTint = hue
    ? {
        backgroundColor: 'var(--paper-hi)',
        backgroundImage: `linear-gradient(rgb(${hue} / 0.19), rgb(${hue} / 0.19))`,
        borderColor: `rgb(${hue} / 0.45)`,
        boxShadow: `0 2px 0 rgb(${hue} / 0.26)`,
      }
    : null;

  return (
    <button
      type="button"
      data-option-state={state}
      data-match-color={matchColor}
      {...rest}
      {...noTranslateProps(
        [
          'group relative flex items-center justify-center overflow-hidden border-2',
          radiusClassName,
          'font-bold leading-snug',
          'transition-[transform,background-color,border-color,box-shadow,color] duration-200',
          'disabled:cursor-default disabled:opacity-100',
          sizeClasses[size],
          stateClasses[state],
          className,
        ]
          .filter(Boolean)
          .join(' '),
      )}
      style={
        matchTint
          ? {
              ...matchTint,
              ...style,
            }
          : style
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span>{children}</span>
    </button>
  );
}
