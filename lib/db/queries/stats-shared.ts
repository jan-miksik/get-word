import type { ActivityWindow } from '@/lib/stats/types';

/** Time/bucket helpers shared by the app-wide and per-school usage statistics. */

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const TREND_WEEKS = 12;

export function numberFromRow(row: Record<string, unknown>, key: string): number {
  return Number(row[key] ?? 0) || 0;
}

export function firstRow(rows: unknown[]): Record<string, unknown> {
  return (rows[0] ?? {}) as Record<string, unknown>;
}

/** UTC Monday 00:00 of the week containing `date`. */
export function getUtcMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d;
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getUtcYearStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

/** Exactly TREND_WEEKS week-start strings ending with the current (partial) week. */
export function weekStarts(currentWeekStart: Date): string[] {
  return Array.from({ length: TREND_WEEKS }, (_, i) =>
    toDateString(new Date(currentWeekStart.getTime() - (TREND_WEEKS - 1 - i) * WEEK_MS))
  );
}

export function zeroFillWeeks<T extends { weekStart: string }>(
  starts: string[],
  rows: Map<string, Omit<T, 'weekStart' | 'partial'>>,
  empty: Omit<T, 'weekStart' | 'partial'>
): (T & { partial?: boolean })[] {
  return starts.map((weekStart, i) => ({
    weekStart,
    ...(rows.get(weekStart) ?? empty),
    ...(i === starts.length - 1 ? { partial: true } : {}),
  })) as (T & { partial?: boolean })[];
}

export function normalizeActivityWindow(value: ActivityWindow | undefined): ActivityWindow {
  return value === 'calendar' ? 'calendar' : 'rolling';
}

/**
 * Window boundaries for DAU/WAU/MAU/YAU. "rolling" counts the trailing 24h/7d/
 * 30d/365d, "calendar" counts the current UTC day/week/month/year to date.
 */
export function getActivityWindowStarts(window: ActivityWindow, now: Date) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  if (window === 'calendar') {
    return {
      day: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      week: getUtcMonday(now),
      month: getUtcMonthStart(now),
      year: getUtcYearStart(now),
    };
  }
  return { day: dayAgo, week: weekAgo, month: monthAgo, year: yearAgo };
}
