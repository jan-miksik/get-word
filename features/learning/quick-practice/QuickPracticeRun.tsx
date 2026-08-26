'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { warmPaletteVars } from '@/features/shared/theme/warm-palette';
import type { LearningRole } from '@/features/learning/state/learningRole';
import type { MiniGameConfig } from '@/features/learning/minigames';
import { MiniGameCard } from '@/features/learning/components/MiniGameCard';

/**
 * A block of rounds played on top of a finished day, then straight back to the
 * card that closed it.
 *
 * Every round is an ordinary `MiniGameCard` — the same component the study
 * stream injects — so no exercise is implemented twice. What is deliberately
 * missing is everything that makes a study session one: no progress is written,
 * no spaced-repetition stage moves, no session plan is consulted. Leaving
 * halfway through therefore costs the learner nothing, which is why the exit is
 * a plain × rather than a confirmation.
 */
export function QuickPracticeRun({
  rounds,
  role,
  onFinish,
}: {
  /** The block, built and frozen by the caller before the run opened. */
  rounds: MiniGameConfig[];
  role: LearningRole;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);

  const round = rounds[index];

  // Nothing playable — the block was emptied underneath the run. Hand the
  // learner back rather than show an empty screen; in an effect, because
  // finishing is the caller's state, not ours.
  useEffect(() => {
    if (!round) onFinish();
  }, [onFinish, round]);

  if (!round) return null;

  return (
    <div
      style={warmPaletteVars}
      className="flex min-h-0 w-full flex-1 flex-col bg-[color:var(--ob-surface)] text-[color:var(--ob-ink)]"
    >
      <div className="mx-auto flex w-full max-w-[800px] shrink-0 items-center gap-3 px-3 pb-4 pt-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-xs font-black uppercase tracking-[0.13em] onboarding-text-soft">
            {t('quickPractice.runTitle')}
          </p>
          <div
            role="progressbar"
            aria-label={t('quickPractice.runTitle')}
            aria-valuemin={1}
            aria-valuemax={rounds.length}
            aria-valuenow={index + 1}
            aria-valuetext={t('quickPractice.runProgress', {
              round: index + 1,
              total: rounds.length,
            })}
            className="mt-1.5 flex items-center gap-1.5"
          >
            {rounds.map((entry, entryIndex) => (
              <span
                key={entry.id}
                aria-hidden
                className={[
                  'h-2 flex-1 rounded-full border-2 border-[color:var(--ob-ink)] transition-colors',
                  entryIndex <= index
                    ? 'bg-[color:var(--ob-accent)]'
                    : 'bg-[color:var(--ob-surface)]',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onFinish}
          aria-label={t('quickPractice.finish')}
          title={t('quickPractice.finish')}
          className="onboarding-option-secondary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {/* The games centre themselves in whatever height they are given and
          several want a card's worth of it, so the play area keeps a floor and
          lets the surface scroll rather than letting a round overflow upwards
          over the rail. */}
      <div className="relative min-h-96 flex-1">
        <MiniGameCard
          key={round.id}
          config={round}
          role={role}
          onDismiss={() => {
            if (index + 1 >= rounds.length) onFinish();
            else setIndex(index + 1);
          }}
        />
      </div>
    </div>
  );
}
