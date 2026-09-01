'use client';

import { useMemo } from 'react';
import { useI18n } from '@/components/I18nProvider';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import type { StreakChipData } from '@/features/learning/goals/streakWeek';
import type { ProgressStats } from '@/lib/progress-stats';
import { StreakSummary } from '../goals/StreakDays';
import { ProgressStatsContent } from './ProgressStatsContent';

/** What today's rollup row can say about the goal, once read. */
type DayGoalView =
  /** No goal covers today, or it resolves to no target at all. */
  | { kind: 'none' }
  /** A goal exists, but the day was planned with nothing to study. */
  | { kind: 'nothing-due' }
  | { kind: 'goal'; done: number; target: number; unit: string; met: boolean };

interface ProgressOverviewPanelProps {
  progressStats: ProgressStats;
  /** Today's row from the goal rollup, or null while it is still loading. */
  goalDay: GoalSummary['days'][number] | null;
  streak: StreakChipData | null;
}

/**
 * The learning overview, as a surface of the app rather than a page of its own.
 *
 * It opens with the day and the series, because that is what the learner came
 * to check; the stage and answer tallies below are the slower story. Everything
 * it draws is handed to it by the study screen, so opening it costs no second
 * hydration and the header, menu and app chrome stay exactly where they were.
 */
export function ProgressOverviewPanel({
  progressStats,
  goalDay,
  streak,
}: ProgressOverviewPanelProps) {
  const { t } = useI18n();
  // The same two readings the closing card gives the day: a minutes goal is
  // measured by the clock the server keeps, a words goal by what was introduced
  // and reviewed against the targets the day was planned with.
  const dayGoal = useMemo<DayGoalView>(() => {
    if (!goalDay || !goalDay.goalMode) return { kind: 'none' };
    // A day with nothing available was planned as 0/0 on purpose. Saying "no
    // goal set" there described the learner's settings, which were fine.
    if (goalDay.goalStatus === 'nothing_due') return { kind: 'nothing-due' };
    if (goalDay.goalMode === 'minutes') {
      const target = goalDay.resolvedMinutesBudget ?? goalDay.goalMinutes ?? 0;
      if (target <= 0) return { kind: 'none' };
      return {
        kind: 'goal',
        done: Math.floor(goalDay.activeMs / 60_000),
        target,
        unit: t('goal.minutesUnit'),
        met: goalDay.met,
      };
    }
    // A words day freezes its targets on the first answer, so before then the
    // row carries only the configured goal. Reading those nulls as zero made a
    // goal the server is already reminding about look like no goal at all.
    const frozen = goalDay.resolvedNewTarget !== null || goalDay.resolvedReviewTarget !== null;
    const target = frozen
      ? (goalDay.resolvedNewTarget ?? 0) + (goalDay.resolvedReviewTarget ?? 0)
      : goalDay.goalWords ?? 0;
    if (target <= 0) return { kind: 'none' };
    return {
      kind: 'goal',
      done: goalDay.introducedWords + goalDay.reviewedWords,
      target,
      unit: t('goal.wordsUnit'),
      met: goalDay.met,
    };
  }, [goalDay, t]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-5 text-ink sm:px-6">
      <h1 className="m-0 text-2xl font-semibold text-ink">{t('progress.title')}</h1>

      <section className="rounded-[22px] border-2 border-ink bg-paper/95 p-4 sm:p-5">
        <h2 className="m-0 mb-2.5 text-base font-semibold text-ink">{t('progress.dayGoal')}</h2>
        {dayGoal.kind === 'goal' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-bold tabular-nums text-ink">
                {dayGoal.done} / {dayGoal.target}
                <span className="ml-1.5 text-sm font-medium text-ink-soft">{dayGoal.unit}</span>
              </span>
              {dayGoal.met && (
                <span className="text-xs font-bold text-green-rail">✓ {t('progress.goalMet')}</span>
              )}
            </div>
            <DayGoalBar done={dayGoal.done} target={dayGoal.target} met={dayGoal.met} />
          </div>
        ) : (
          <p className="m-0 text-sm text-ink-soft">
            {t(dayGoal.kind === 'nothing-due' ? 'progress.goalNothingDue' : 'progress.noGoal')}
          </p>
        )}
        {streak && <StreakSummary streak={streak} />}
      </section>

      <ProgressStatsContent progressStats={progressStats} />
    </div>
  );
}

function DayGoalBar({ done, target, met }: { done: number; target: number; met: boolean }) {
  const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-pill border-2 border-ink bg-paper">
      <div
        className={`h-full transition-[width] duration-[220ms] ease-med ${met ? 'bg-green-rail' : 'bg-sea'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
