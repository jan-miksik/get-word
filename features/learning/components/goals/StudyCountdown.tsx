'use client';

import { useI18n } from '@/components/I18nProvider';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
import { formatDuration, useStudyCountdown, type StudyCountdown as Countdown } from '@/features/learning/goals/useStudyCountdown';
import {
  useGoalStripVariant,
  type GoalStripVariant,
} from './goalStripVariant';

function percent(value: number): string {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

/**
 * The day filling up, under a slow sheen so a strip that has not moved for a
 * card or two still reads as live rather than as a static bar.
 */
function TideLayer({ progress }: { progress: number }) {
  return (
    <span
      aria-hidden
      className="goal-strip-tide absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-500"
      style={{ width: percent(progress) }}
    />
  );
}

/**
 * Time spent against work still owed, drawn towards each other from the two
 * ends. The gap between the edges is the day's remaining slack; when they meet
 * the plan is exactly spent, and the overlap past that is the overrun.
 */
function SandLayer({ countdown }: { countdown: Countdown }) {
  const budget = countdown.budgetMs;
  if (budget <= 0) return null;
  const spent = Math.min(1, countdown.activeMs / budget);
  const owed = Math.min(1, countdown.remainingWorkMs / budget);
  const overlaps = spent + owed > 1;
  return (
    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]">
      <span
        className="absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: percent(spent), background: 'var(--rail-review)' }}
      />
      <span
        className="absolute inset-y-0 right-0 motion-safe:transition-[width] motion-safe:duration-500"
        style={{
          width: percent(owed),
          background: overlaps ? 'var(--danger)' : 'var(--rail-new)',
        }}
      />
    </span>
  );
}

/**
 * A stroke closing around the countdown itself. `pathLength` normalises the
 * rectangle's perimeter to 100, so the dash maths stays exact however wide the
 * time inside it renders.
 */
function RingLayer({ progress }: { progress: number }) {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect
        x="2" y="2" width="96" height="96" rx="28"
        fill="none" stroke="var(--rail-track)" strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x="2" y="2" width="96" height="96" rx="28"
        fill="none" stroke="var(--rail-review)" strokeWidth="4"
        strokeLinecap="round" vectorEffect="non-scaling-stroke"
        pathLength={100}
        strokeDasharray={`${Math.max(0, Math.min(1, progress)) * 100} 100`}
        className="motion-safe:transition-[stroke-dasharray] motion-safe:duration-500"
      />
    </svg>
  );
}

function Clock({
  countdown,
  variant,
  label,
}: {
  countdown: Countdown;
  variant: GoalStripVariant;
  label: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center px-2.5 py-1">
      {variant === 'ring' ? <RingLayer progress={countdown.progress} /> : null}
      <strong
        className={`relative tabular-nums ${countdown.isOnPace ? 'text-text' : 'text-danger'}`}
      >
        {label}
      </strong>
    </span>
  );
}

export function StudyCountdown({
  day,
  goal,
  enabled,
}: {
  day: GoalSummary['days'][number] | null;
  goal: StudyGoalVersion | null;
  enabled: boolean;
}) {
  const { t } = useI18n();
  const variant = useGoalStripVariant();
  const countdown = useStudyCountdown(day, goal, enabled);

  if (!day || !enabled) return null;
  if (day.goalStatus === 'nothing_due') {
    return (
      <aside className="mx-auto mt-2 w-full max-w-[800px] rounded-xl border border-border-subtle bg-background-elevated px-4 py-2 text-center text-sm font-semibold text-text-soft">
        {t('goal.nothingDue')}
      </aside>
    );
  }

  const finished = countdown.remainingItems <= 0;
  const clockLabel = finished
    ? t('goal.dayDone')
    : t('goal.remaining', { time: formatDuration(countdown.remainingWorkMs) });

  return (
    <aside
      aria-label={t('goal.progressLabel')}
      className="relative mx-auto mt-2 w-full max-w-[800px] overflow-hidden rounded-xl border border-border-subtle bg-background-elevated text-sm text-text"
    >
      {variant === 'tide' ? <TideLayer progress={countdown.progress} /> : null}
      {variant === 'sand' ? <SandLayer countdown={countdown} /> : null}
      <div className="relative flex items-center justify-between gap-3 px-4 py-2">
        {day.goalMode === 'words' ? (
          <>
            <span>
              <strong className="tabular-nums">{day.introducedWords}/{day.resolvedNewTarget ?? 0}</strong>
              {' '}{t('goal.newWords')}
            </span>
            <span>
              <strong className="tabular-nums">{day.reviewedWords}/{day.resolvedReviewTarget ?? 0}</strong>
              {' '}{t('goal.reviews')}
            </span>
          </>
        ) : (
          <span>
            <strong className="tabular-nums">{countdown.itemsDone}/{countdown.itemsTotal}</strong>
            {' '}{t('goal.items')}
          </span>
        )}
        <Clock countdown={countdown} variant={variant} label={clockLabel} />
      </div>
    </aside>
  );
}
