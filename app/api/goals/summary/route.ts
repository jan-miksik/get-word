import { NextRequest, NextResponse } from 'next/server';

import { resolveAuthenticatedUser } from '@/lib/auth';
import { getStudyGoalState, getStudyGoalVersions, getUserDayStats, recomputeUserDayStat } from '@/lib/db';
import { addDays, isoWeekStart } from '@/packages/domain/goals/week';
import { calculateDailyStreak, calculateWeeklyAdherenceStreak, effectiveWeeklyTarget } from '@/packages/domain/goals/streak';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
import { localDayKeyAt, normalizeIanaTimezone } from '@/lib/local-day';

function goalForDay(versions: StudyGoalVersion[], dayKey: string): StudyGoalVersion | null {
  let result: StudyGoalVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFromDay > dayKey) break;
    result = version;
  }
  return result?.enabled ? result : null;
}

function calculateStreaks(
  rows: Awaited<ReturnType<typeof getUserDayStats>>,
  versions: StudyGoalVersion[],
  today: string,
): { daily: number; weekly: number } {
  const byDay = new Map(rows.map((row) => [row.dayKey, row]));
  // An unfinished current day does not erase yesterday's streak before the
  // learner has had the entire local day to act. Once it is met, it belongs at
  // the head of the run immediately.
  const todayRow = byDay.get(today);
  const startOffset = todayRow?.met === true || todayRow?.goalStatus === 'nothing_due' ? 0 : 1;
  const days = Array.from({ length: 84 - startOffset }, (_, index) => addDays(today, -(index + startOffset))).map((dayKey) => {
    const row = byDay.get(dayKey);
    const active = goalForDay(versions, dayKey) !== null;
    return { active, met: row?.met === true, nothingDue: row?.goalStatus === 'nothing_due' };
  });
  const currentMonday = isoWeekStart(today);
  const weeks = Array.from({ length: 12 }, (_, index) => addDays(currentMonday, -7 * (index + 1))).map((monday) => {
    const mondayGoal = goalForDay(versions, monday);
    const weekDays = Array.from({ length: 7 }, (_, offset) => {
      const dayKey = addDays(monday, offset);
      return { goal: goalForDay(versions, dayKey), row: byDay.get(dayKey) };
    });
    // Only a real, server-created nothing_due snapshot can make a day neutral.
    // A missing row means no snapshot was taken, therefore a missed active day.
    const activeEligibleDays = weekDays.filter(({ goal, row }) => goal !== null && row?.goalStatus !== 'nothing_due').length;
    const metDays = weekDays.filter(({ goal, row }) => goal !== null && row?.met === true).length;
    const required = effectiveWeeklyTarget(mondayGoal?.daysPerWeek ?? 0, activeEligibleDays);
    return { active: mondayGoal !== null && activeEligibleDays > 0, metDays, required };
  });
  return { daily: calculateDailyStreak(days), weekly: calculateWeeklyAdherenceStreak(weeks) };
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
  const [goal, days, versions] = await Promise.all([
    getStudyGoalState(user.id, timezone),
    getUserDayStats(user.id, fromDay, today),
    getStudyGoalVersions(user.id),
  ]);
  const streaks = calculateStreaks(days, versions, today);
  return NextResponse.json({
    today, timezone, goal,
    reminder: {
      enabled: user.goalReminderEnabled,
      localMinutes: user.goalReminderLocalMinutes ?? 19 * 60,
      onboardingAnswered: user.goalReminderIntroAnswered,
    },
    days: days.map((row) => ({
      dayKey: row.dayKey, activeMs: row.activeMs, answeredWords: row.answeredWords,
      goalDaysPerWeek: row.goalDaysPerWeek, goalMinutes: row.goalMinutes,
      goalWords: row.goalWords,
      goalMode: row.goalMode === 'words' || row.goalMode === 'minutes' ? row.goalMode : null,
      goalStatus: row.goalStatus === 'nothing_due' ? 'nothing_due' : 'active',
      availableNewWords: row.availableNewWords, dueReviewCount: row.dueReviewCount,
      resolvedNewTarget: row.resolvedNewTarget, resolvedReviewTarget: row.resolvedReviewTarget,
      resolvedItemBudget: row.resolvedItemBudget, resolvedMinutesBudget: row.resolvedMinutesBudget,
      introducedWords: row.introducedWords, reviewedWords: row.reviewedWords, met: row.met,
    })),
    // `streakWeeks` stays for older settings UI consumers. New clients use the
    // explicit adherence name alongside the truly consecutive daily streak.
    streakWeeks: streaks.weekly,
    weeklyAdherenceStreak: streaks.weekly,
    dailyStreakDays: streaks.daily,
    streakWeeksAtWindowStart: 0,
    graceCooldownRemainingAtWindowStart: 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
