import { NextRequest, NextResponse } from 'next/server';

import { resolveAuthenticatedUser } from '@/lib/auth';
import { getStudyGoalState, getUserDayStats, recomputeUserDayStat } from '@/lib/db';
import { addDays, isoWeekStart } from '@/packages/domain/goals/week';
import { calculateStreak, type GoalWeek } from '@/packages/domain/goals/streak';
import { localDayKeyAt, normalizeIanaTimezone } from '@/lib/local-day';

function weeklyRows(rows: Awaited<ReturnType<typeof getUserDayStats>>, today: string): GoalWeek[] {
  const weeks = new Map<string, { metDays: number; required: number; completed: boolean }>();
  for (const row of rows) {
    const weekKey = isoWeekStart(row.dayKey);
    const current = weeks.get(weekKey) ?? { metDays: 0, required: row.goalDaysPerWeek ?? 1, completed: weekKey !== isoWeekStart(today) };
    current.metDays += row.met ? 1 : 0;
    if (row.goalDaysPerWeek !== null) current.required = row.goalDaysPerWeek;
    weeks.set(weekKey, current);
  }
  return [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, week]) => week);
}

export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const timezone = normalizeIanaTimezone(user.timezone);
  const today = localDayKeyAt(Date.now(), timezone);
  // Self-heal the recent window; failure is deliberately isolated from reads.
  await Promise.all(Array.from({ length: 14 }, (_, index) =>
    recomputeUserDayStat(user.id, addDays(today, -index), timezone).catch(() => undefined),
  ));
  const fromDay = addDays(today, -83);
  const [goal, days] = await Promise.all([
    getStudyGoalState(user.id, timezone),
    getUserDayStats(user.id, fromDay, today),
  ]);
  const streakWeeks = calculateStreak({ weeks: weeklyRows(days, today) });
  return NextResponse.json({
    today, timezone, goal,
    reminder: {
      enabled: user.goalReminderEnabled,
      localMinutes: user.goalReminderLocalMinutes ?? 19 * 60,
    },
    days: days.map((row) => ({
      dayKey: row.dayKey, activeMs: row.activeMs, answeredWords: row.answeredWords,
      goalDaysPerWeek: row.goalDaysPerWeek, goalMinutes: row.goalMinutes,
      goalWords: row.goalWords, met: row.met,
    })),
    streakWeeks,
    streakWeeksAtWindowStart: 0,
    graceCooldownRemainingAtWindowStart: 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
