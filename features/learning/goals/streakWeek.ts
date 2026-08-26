import type { GoalSummary } from '@/packages/contracts/src/goals';
import { preferredForDay, type DayStatus } from '@/packages/domain/goals/studyStreak';
import { addDays, isoWeekday, isoWeekStart } from '@/packages/domain/goals/week';

export interface StreakDay {
  dayKey: string;
  /** ISO weekday, Monday = 1. */
  weekday: number;
  status: DayStatus;
  /**
   * Does the goal prefer this weekday? A preference only — the weekly target
   * counts days, not which days — so a missed preferred day is not a failure.
   * `null` when the goal names no weekdays.
   */
  preferred: boolean | null;
  isToday: boolean;
  isFuture: boolean;
}

/** What the header chip and the end-of-day card both need to draw the series. */
export interface StreakChipData {
  days: StreakDay[];
  /**
   * The last six ISO weeks, oldest first, current week last. Only the variants
   * that show the long arc read this; the rest use `days`.
   */
  weeks: StreakDay[][];
  dailyStreak: number;
  weeklyStreak: number;
  /** Days kept this week against the number promised. */
  keptThisWeek: number;
  weekTarget: number;
}

/**
 * The seven days of the current ISO week, ready to draw.
 *
 * Every date here comes from `summary.today` — the local day key the server
 * computed in the learner's timezone — and never from `new Date()`. Across
 * midnight the two disagree, and a client-side "today" would slide the whole
 * seven-segment week one place against the numbers beside it.
 *
 * Days the learner never opened have no row at all, so `preferred` falls back to
 * the currently active goal. That is right for the current week, which is the
 * only week this draws; a goal edited mid-week is covered by the per-row value
 * the server sends for days that do have a snapshot.
 */
export function resolveStreakWeek(summary: GoalSummary, weeksBack = 0): StreakDay[] {
  const byDay = new Map(summary.days.map((day) => [day.dayKey, day]));
  const active = summary.goal.active;
  const monday = addDays(isoWeekStart(summary.today), -7 * weeksBack);
  const neutralWeek = summary.neutralWeekStarts.includes(monday);

  return Array.from({ length: 7 }, (_, offset) => {
    const dayKey = addDays(monday, offset);
    const row = byDay.get(dayKey);
    const status = row?.status;
    const fallbackPreferred = active?.enabled
      ? preferredForDay({ weekdays: active.weekdays }, dayKey)
      : false;
    return {
      dayKey,
      weekday: isoWeekday(dayKey),
      // A first partial week that ended below quota is neutral, not a row of
      // fabricated misses. Summary refreshes create empty measurement rows, so
      // `none` is neutralized too; actual partial/met/exceeded work stays visible.
      status: neutralWeek && (!status || status === 'none')
        ? 'nothing_due'
        : status ?? 'none',
      preferred: row ? row.preferred : fallbackPreferred,
      isToday: dayKey === summary.today,
      isFuture: dayKey > summary.today,
    };
  });
}

/** Everything the chip and the end-of-day card draw, from one summary. */
export function resolveStreakData(
  summary: GoalSummary,
  { optimisticTodayComplete = false }: { optimisticTodayComplete?: boolean } = {},
): StreakChipData | null {
  if (!summary.goal.active?.enabled) return null;
  const serverDays = resolveStreakWeek(summary);
  const serverWeeks = Array.from({ length: 6 }, (_, index) => resolveStreakWeek(summary, 5 - index));
  if (!optimisticTodayComplete) {
    return {
      days: serverDays,
      weeks: serverWeeks,
      dailyStreak: summary.dailyStreak,
      weeklyStreak: summary.weeklyStreak,
      keptThisWeek: summary.currentWeek.keptDays,
      weekTarget: summary.currentWeek.target,
    };
  }

  const today = serverDays.find((day) => day.isToday);
  const alreadyKept = today?.status === 'met' || today?.status === 'exceeded';
  const markToday = (day: StreakDay): StreakDay =>
    day.isToday && day.status !== 'exceeded' ? { ...day, status: 'met' } : day;
  const keptThisWeek = summary.currentWeek.keptDays + (alreadyKept ? 0 : 1);
  const completesWeekNow =
    !alreadyKept &&
    summary.currentWeek.target > 0 &&
    summary.currentWeek.keptDays < summary.currentWeek.target &&
    keptThisWeek >= summary.currentWeek.target;

  return {
    days: serverDays.map(markToday),
    weeks: serverWeeks.map((week) => week.map(markToday)),
    // While today is still absent from the rollup the server deliberately
    // leaves yesterday's run intact. Completing today extends that run by one.
    dailyStreak: summary.dailyStreak + (alreadyKept ? 0 : 1),
    weeklyStreak: summary.weeklyStreak + (completesWeekNow ? 1 : 0),
    keptThisWeek,
    weekTarget: summary.currentWeek.target,
  };
}
