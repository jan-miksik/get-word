'use client';

import { useMemo } from 'react';

import { useI18n } from '@/components/I18nProvider';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import { addDays, isoWeekStart } from '@/packages/domain/goals/week';

type WeekRow = {
  start: string;
  required: number;
  days: Array<{ dayKey: string; met: boolean; future: boolean; touched: boolean }>;
};

/**
 * Twelve weeks of "did I keep the rhythm", plus the streak.
 *
 * The goal is weekly, not daily — a four-day goal is kept by any four days —
 * so the grid is laid out a week per row and the row itself is marked kept or
 * missed. Individual days are texture; the row is the verdict.
 */
export function StudyGoalHistory({ summary }: { summary: GoalSummary }) {
  const { t } = useI18n();

  const weeks = useMemo<WeekRow[]>(() => {
    const byDay = new Map(summary.days.map((day) => [day.dayKey, day]));
    const firstWeek = isoWeekStart(addDays(summary.today, -7 * 11));
    const rows: WeekRow[] = [];
    for (let index = 0; index < 12; index += 1) {
      const start = addDays(firstWeek, index * 7);
      const dayKeys = Array.from({ length: 7 }, (_, offset) => addDays(start, offset));
      const required = dayKeys.reduce((latest, dayKey) =>
        byDay.get(dayKey)?.goalDaysPerWeek ?? latest,
      0);
      rows.push({
        start,
        required,
        days: dayKeys.map((dayKey) => {
          const record = byDay.get(dayKey);
          return {
            dayKey,
            met: record?.met === true,
            future: dayKey > summary.today,
            touched: (record?.answeredWords ?? 0) > 0 || (record?.activeMs ?? 0) > 0,
          };
        }),
      });
    }
    return rows;
  }, [summary]);

  const required = weeks.at(-1)?.required ?? summary.goal.active?.daysPerWeek ?? 0;
  const metThisWeek = weeks.at(-1)?.days.filter((day) => day.met).length ?? 0;

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="m-0 text-xs font-semibold text-text">{t('settings.studyGoalHistory')}</p>
        <p className="m-0 text-xs font-semibold text-accent">
          {t('settings.studyGoalStreak', { count: summary.streakWeeks })}
        </p>
      </div>

      <div className="flex flex-col gap-[3px]">
        {weeks.map((week) => {
          const kept = week.required > 0 && week.days.filter((day) => day.met).length >= week.required;
          return (
            <div key={week.start} className="flex items-center gap-[3px]">
              <span
                aria-hidden
                className="h-3 w-[3px] shrink-0 rounded-full"
                style={{ background: kept ? 'var(--rail-new)' : 'var(--rail-track)' }}
              />
              {week.days.map((day) => (
                <span
                  key={day.dayKey}
                  title={day.dayKey}
                  className="h-3 flex-1 rounded-[3px]"
                  style={{
                    background: day.future
                      ? 'transparent'
                      : day.met
                        ? 'var(--rail-review)'
                        : day.touched
                          ? 'color-mix(in srgb, var(--rail-review) 32%, transparent)'
                          : 'var(--rail-track)',
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      {required > 0 ? (
        <p className="m-0 text-xs text-text-soft">
          {t('settings.studyGoalThisWeek', { met: metThisWeek, required })}
        </p>
      ) : null}
    </div>
  );
}
