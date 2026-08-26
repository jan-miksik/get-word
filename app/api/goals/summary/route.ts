import { NextRequest, NextResponse } from 'next/server';

import { resolveAuthenticatedUser } from '@/lib/auth';
import { getStudyGoalState, getStudyGoalVersions, getUserDayStats, recomputeUserDayStat } from '@/lib/db';
import { addDays, isoWeekStart } from '@/packages/domain/goals/week';
import { calculateWeeklyAdherenceStreak } from '@/packages/domain/goals/streak';
import {
  calculateDailyStreak,
  calculateWeeklyStreak,
  preferredForDay,
  resolveGoalWeek,
  resolveDayStatus,
  type DayStatsInput,
  type DayStatus,
  type StreakDayInput,
} from '@/packages/domain/goals/studyStreak';
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

type DayRow = Awaited<ReturnType<typeof getUserDayStats>>[number];

function statusOf(row: DayRow | undefined, hasGoal: boolean): DayStatus {
  // Measurement rows may exist before the learner creates a goal. Activity on
  // such a day is real history, but it cannot be a missed or partial goal day.
  if (!hasGoal) return 'nothing_due';
  if (!row) return 'none';
  return resolveDayStatus({
    met: row.met,
    goalStatus: row.goalStatus === 'nothing_due' ? 'nothing_due' : 'active',
    goalMode: row.goalMode === 'words' || row.goalMode === 'minutes' ? row.goalMode : null,
    answeredWords: row.answeredWords,
    activeMs: row.activeMs,
    introducedWords: row.introducedWords,
    reviewedWords: row.reviewedWords,
    resolvedNewTarget: row.resolvedNewTarget,
    resolvedReviewTarget: row.resolvedReviewTarget,
    resolvedItemBudget: row.resolvedItemBudget,
    resolvedMinutesBudget: row.resolvedMinutesBudget,
  } satisfies DayStatsInput);
}

function calculateStreaks(
  rows: DayRow[],
  versions: StudyGoalVersion[],
  today: string,
): {
  daily: number;
  weekly: number;
  legacyWeekly: number;
  currentWeek: { keptDays: number; target: number };
  neutralWeekStarts: string[];
} {
  const byDay = new Map(rows.map((row) => [row.dayKey, row]));
  // Every day in the window, not only the ones with a row: a day the learner
  // never opened the app has no snapshot, and skipping it would quietly treat a
  // missed day as neutral.
  const days: StreakDayInput[] = Array.from({ length: 84 }, (_, index) => addDays(today, -index)).map((dayKey) => {
    const hasGoal = goalForDay(versions, dayKey) !== null;
    return { dayKey, status: statusOf(byDay.get(dayKey), hasGoal), hasGoal };
  });

  const currentMonday = isoWeekStart(today);
  // Index 0 is the current week, which is pending rather than failed.
  const weeks = Array.from({ length: 13 }, (_, index) => addDays(currentMonday, -7 * index)).map((monday) => {
    const weekDays = Array.from({ length: 7 }, (_, offset) => {
      const dayKey = addDays(monday, offset);
      const goal = goalForDay(versions, dayKey);
      return {
        hasGoal: goal !== null,
        daysPerWeek: goal?.daysPerWeek ?? null,
        status: statusOf(byDay.get(dayKey), goal !== null),
      };
    });
    return {
      monday,
      ...resolveGoalWeek(weekDays, monday === currentMonday),
    };
  });

  const current = weeks[0];
  return {
    daily: calculateDailyStreak(days, today),
    weekly: calculateWeeklyStreak(weeks),
    // The older settings grid still reads the literal adherence figure.
    legacyWeekly: calculateWeeklyAdherenceStreak(
      weeks.slice(1).map((week) => ({ active: week.active, metDays: week.keptDays, required: week.target })),
    ),
    currentWeek: { keptDays: current?.keptDays ?? 0, target: current?.target ?? 0 },
    neutralWeekStarts: weeks.filter((week) => week.partialStartNeutral).map((week) => week.monday),
  };
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
      preferred: preferredForDay(goalForDay(versions, row.dayKey), row.dayKey),
      status: statusOf(row, goalForDay(versions, row.dayKey) !== null),
    })),
    // `streakWeeks` stays for older settings UI consumers. New clients use the
    // explicit adherence name alongside the study streak.
    streakWeeks: streaks.legacyWeekly,
    weeklyAdherenceStreak: streaks.legacyWeekly,
    // Compatibility for clients released before the explicit streak names.
    dailyStreakDays: streaks.daily,
    dailyStreak: streaks.daily,
    weeklyStreak: streaks.weekly,
    currentWeek: streaks.currentWeek,
    neutralWeekStarts: streaks.neutralWeekStarts,
    streakWeeksAtWindowStart: 0,
    graceCooldownRemainingAtWindowStart: 0,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
