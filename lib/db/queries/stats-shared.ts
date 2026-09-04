import { sql, type SQL } from 'drizzle-orm';

import type { ActivityWindow, TesterScope } from '@/lib/stats/types';

/** Binds a string list as a text[] so it can be used with `= ANY(...)`. */
export function sqlTextArray(values: string[]): SQL {
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

/**
 * Which accounts the statistics are about, by app user id or by email.
 * Structurally compatible with the resolved `UsageStatsOptions` fields, kept
 * here so panels that live outside `usage-stats.ts` apply the same filter
 * instead of quietly reporting a different population.
 *
 * `onlyUserEmails`, when non-empty, narrows the dashboard *to* that list —
 * that is how "show only the store testers" is served by the same queries that
 * normally hide them.
 */
export interface StatsUserFilter {
  excludedUserIds: string[];
  excludedUserEmails: string[];
  onlyUserEmails?: string[];
}

/** True for a row that must be left out. `alias` is a `users` table alias. */
function excludedUserCondition(alias: string, options: StatsUserFilter): SQL {
  const checks: SQL[] = [];
  const quotedAlias = sql.raw(alias);
  if (options.excludedUserIds.length > 0) {
    checks.push(sql`${quotedAlias}.id::text = ANY(${sqlTextArray(options.excludedUserIds)})`);
  }
  if (options.excludedUserEmails.length > 0) {
    checks.push(sql`lower(coalesce(${quotedAlias}.email, '')) = ANY(${sqlTextArray(options.excludedUserEmails)})`);
  }
  if (checks.length === 0) return sql`false`;
  return sql`coalesce((${sql.join(checks, sql` OR `)}), false)`;
}

export function includedUserCondition(alias: string, options: StatsUserFilter): SQL {
  const excluded = sql`NOT (${excludedUserCondition(alias, options)})`;
  const only = options.onlyUserEmails ?? [];
  if (only.length === 0) return excluded;
  const quotedAlias = sql.raw(alias);
  return sql`(${excluded} AND lower(coalesce(${quotedAlias}.email, '')) = ANY(${sqlTextArray(only)}))`;
}

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

/** Anything unrecognised means the default reading: testers left out. */
export function normalizeTesterScope(value: string | null | undefined): TesterScope {
  return value === 'only' || value === 'all' ? value : 'hide';
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
