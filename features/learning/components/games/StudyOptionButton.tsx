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

/** Which edge a settled matching button carries its pair spine on. */
export type StudyOptionMatchEdge = 'left' | 'right';

const sizeClasses: Record<StudyOptionSize, string> = {
  lg: 'min-h-20 px-4 py-4 text-xl sm:min-h-24 sm:text-2xl',
  md: 'min-h-16 px-3 py-3 text-lg sm:text-xl',
  sm: 'min-h-14 px-3 py-2.5 text-base sm:text-lg',
};

const stateClasses: Record<StudyOptionState, string> = {
  idle:
    'border-ink-faint bg-paper-hi text-ink shadow-[0_3px_0_#D8C9AF] ' +
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
  // Everything colourful (wash, border, spine) is inline, keyed off the pair's
  // hue — the fixed green border used to fight whatever tint the pair drew.
  // The class values are the fallback for a settled button with no colour.
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
  matchEdge = 'left',
  disabled = false,
  onClick,
  enterIndex,
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
  /** Put the spine on the edge facing the other column. */
  matchEdge?: StudyOptionMatchEdge;
  disabled?: boolean;
  onClick?: () => void;
  /** Staggers the deal-in animation; omit to skip the entrance entirely. */
  enterIndex?: number;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & Record<`data-${string}`, string | number | undefined>) {
  const animate = state === 'idle' && enterIndex !== undefined;
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
          'group relative flex items-center justify-center overflow-hidden rounded-2xl border-[1.5px]',
          'font-bold leading-snug',
          'transition-[transform,background-color,border-color,box-shadow,color] duration-200',
          'disabled:cursor-default disabled:opacity-100',
          sizeClasses[size],
          stateClasses[state],
          animate ? 'motion-safe:animate-deck-enter-rise' : '',
          className,
        ]
          .filter(Boolean)
          .join(' '),
      )}
      style={
        animate || matchTint
          ? {
              ...(animate ? { animationDelay: `${enterIndex! * 55}ms` } : null),
              ...matchTint,
              ...style,
            }
          : style
      }
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {hue ? (
        // A spine in the pair's own colour, on the edge facing the other
        // column, so the two halves point at each other across the gutter.
        // Two halves of a pair sit far apart on the board and a pale wash
        // alone is a weak tie — especially for anyone who cannot tell two of
        // the six hues apart.
        <span
          aria-hidden="true"
          className={`absolute inset-y-2 w-[5px] rounded-full ${
            matchEdge === 'right' ? 'right-1.5' : 'left-1.5'
          }`}
          style={{ background: `rgb(${hue} / 0.85)` }}
        />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
