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

const sizeClasses: Record<StudyOptionSize, string> = {
  lg: 'min-h-20 px-4 py-4 text-xl sm:min-h-24 sm:text-2xl',
  md: 'min-h-16 px-3 py-3 text-lg sm:text-xl',
  sm: 'min-h-14 px-3 py-2.5 text-base sm:text-lg',
};

const stateClasses: Record<StudyOptionState, string> = {
  idle:
    'border-[#BBAE98] bg-[#FFF8E8] text-[#2A2218] shadow-[0_3px_0_#D8C9AF] ' +
    'hover:-translate-y-0.5 hover:border-[#1E6FA8] hover:shadow-[0_5px_0_#C7B89E] ' +
    'active:translate-y-[2px] active:shadow-none',
  selected: 'border-[#1E6FA8] bg-[#E4EEF6] text-[#17608F] shadow-[0_3px_0_#B5CFE4]',
  correct:
    'scale-[1.025] border-[#187A43] bg-[#E3F3E7] text-[#145B33] shadow-[0_4px_0_#A9D3B6] ' +
    'motion-safe:animate-[pulse_420ms_ease-out_1]',
  // Settled pairs step back so the buttons still in play stay the loud ones.
  matched: 'border-[#187A43]/60 text-[#2A2218] shadow-none',
  wrong:
    'border-[#B91C1C] bg-[#FCE7E5] text-[#8F1515] shadow-[0_3px_0_#E4AAA6] ' +
    'motion-safe:animate-[game-shake_350ms_ease]',
  reveal: 'border-[#187A43] bg-[#F1F7ED] text-[#187A43] shadow-none',
};

export function StudyOptionButton({
  state,
  size = 'md',
  matchColor,
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
  const matchTint =
    state === 'matched' && matchColor
      ? { background: `rgb(var(--match-${matchColor}) / 0.22)` }
      : state === 'matched'
        ? { background: '#F1EADB' }
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
      <span>{children}</span>
    </button>
  );
}
