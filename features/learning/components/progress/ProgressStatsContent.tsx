'use client';

import { STAGES } from '@/lib/words';
import type { ProgressStats } from '@/lib/progress-stats';
import { useI18n } from '@/components/I18nProvider';
import type { I18nKey } from '@/lib/i18n/messages';

interface ProgressStatsContentProps {
  progressStats: ProgressStats;
}

/**
 * The tallies, drawn on the app's own paper rather than the dashboard chrome
 * the admin pages use: same ink outlines and cream cards as a study card, so
 * the overview reads as a page of the app and not as a report about it.
 */
const CARD = 'rounded-2xl border-2 border-ink bg-paper-hi';

export function ProgressStatsContent({ progressStats }: ProgressStatsContentProps) {
  const { t } = useI18n();
  const totalAnswers = progressStats.totalKnown + progressStats.totalUnknown;
  const accuracy = totalAnswers > 0
    ? Math.round((progressStats.totalKnown / totalAnswers) * 100)
    : 0;

  return (
    <div className="text-ink">
      {/* Two numbers only: how much there is, and how much of it is asking to
          be repeated right now. The stage list below says the rest. */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className={`${CARD} p-3 text-center`}>
          <div className="text-2xl font-bold text-sea mb-0.5 tabular-nums">{progressStats.total}</div>
          <div className="text-xs text-ink-soft font-medium">{t('progress.totalWords')}</div>
        </div>
        <div className={`${CARD} p-3 text-center`}>
          <div className="text-2xl font-bold text-sea mb-0.5 tabular-nums">{progressStats.readyCount}</div>
          <div className="text-xs text-ink-soft font-medium">{t('progress.readyNow')}</div>
        </div>
      </div>

      {/* Words by Stage */}
      <div className="mb-5">
        <h2 className="text-base font-semibold m-0 mb-2.5 text-ink">{t('progress.wordsByStage')}</h2>
        <div className="flex flex-col gap-1.5">
          {STAGES.map((stage, index) => {
            // The top stage holds two different things: words booked for
            // another 60 days, and words retired as fully known. They get a row
            // each, so the retired ones are subtracted here rather than counted
            // twice.
            const count = index === STAGES.length - 1
              ? progressStats.byStage[index] - progressStats.retired
              : progressStats.byStage[index];
            if (count === 0 && index > 0) return null; // Skip empty stages except stage 0

            const barPercent = progressStats.total > 0 ? (count / progressStats.total * 100) : 0;
            const isMastered = index >= 6;

            return (
              <div key={index} className={`${CARD} py-2 px-3 flex items-center gap-2`}>
                <div className="flex-1 text-[0.8125rem] font-semibold text-ink">{t(`stage.${stage.id}` as I18nKey)}</div>
                <div className="text-sm font-bold text-ink min-w-[28px] text-right tabular-nums">{count}</div>
                <div className="w-[60px] h-1.5 bg-ink/15 rounded-pill overflow-hidden">
                  <div
                    className={`h-full rounded-pill transition-[width] duration-[220ms] ease-med ${isMastered ? 'bg-green-rail' : 'bg-sea'}`}
                    style={{ width: `${barPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
          {progressStats.retired > 0 && (
            <div className={`${CARD} py-2 px-3 flex items-center gap-2`}>
              <div className="flex-1 text-[0.8125rem] font-semibold text-ink">{t('progress.retired')}</div>
              <div className="text-sm font-bold text-ink min-w-[28px] text-right tabular-nums">{progressStats.retired}</div>
              <div className="w-[60px] h-1.5 bg-ink/15 rounded-pill overflow-hidden">
                <div
                  className="h-full rounded-pill bg-green-rail transition-[width] duration-[220ms] ease-med"
                  style={{
                    width: `${progressStats.total > 0 ? (progressStats.retired / progressStats.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Answer statistics */}
      <div>
        <h2 className="text-base font-semibold m-0 mb-2.5 text-ink">{t('progress.answerStats')}</h2>
        <div className="grid grid-cols-3 gap-2">
          <div className={`${CARD} p-2.5 text-center`}>
            <div className="text-[0.6875rem] text-ink-soft mb-1 font-medium">{t('progress.correct')}</div>
            <div className="text-xl font-bold text-green-rail tabular-nums">{progressStats.totalKnown}</div>
          </div>
          <div className={`${CARD} p-2.5 text-center`}>
            <div className="text-[0.6875rem] text-ink-soft mb-1 font-medium">{t('progress.incorrect')}</div>
            <div className="text-xl font-bold text-brick tabular-nums">{progressStats.totalUnknown}</div>
          </div>
          <div className={`${CARD} p-2.5 text-center`}>
            <div className="text-[0.6875rem] text-ink-soft mb-1 font-medium">{t('progress.accuracy')}</div>
            <div className="text-xl font-bold text-ink tabular-nums">{accuracy}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
