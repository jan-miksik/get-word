'use client';

import { useI18n } from '@/components/I18nProvider';

/**
 * The way out of a practice round.
 *
 * Only cards that exist to drill — the minigames dealt into the stream — get
 * one. A study card grades a specific answer, so leaving it half-finished would
 * have to mean something for the spaced repetition; a practice round means
 * nothing either way, and a learner stuck on one pair should be able to move on
 * without guessing at random until the board clears.
 *
 * Deliberately quiet: it sits opposite the sound toggle, in the same reserved
 * top strip, and reads as a label rather than an action.
 */
export function SkipExerciseButton({ onSkip }: { onSkip: () => void }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSkip();
      }}
      className="absolute left-3 top-3 z-20 inline-flex h-9 items-center rounded-full px-3 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink/45 transition-colors duration-150 hover:bg-ink/8 hover:text-ink"
    >
      {t('game.skipExercise')}
    </button>
  );
}
