import { describe, expect, it } from 'vitest';

import { resolveStreakData, resolveStreakWeek } from '../streakWeek';
import type { GoalSummary } from '@/packages/contracts/src/goals';

// 2026-08-24 is a Monday; today is Wednesday of that week.
const TODAY = '2026-08-26';

function summary(overrides: Partial<GoalSummary> = {}): GoalSummary {
  return {
    today: TODAY,
    timezone: 'Europe/Prague',
    goal: {
      active: {
        id: 'g1', effectiveFromDay: '2026-01-01', enabled: true, mode: 'words',
        daysPerWeek: 4, weekdays: [1, 3, 5, 7], minutesPerDay: 10, wordsPerDay: 10,
        newWordsPerDay: 10, preset: 'custom', pacing: null,
      },
      pending: null,
      revision: 1,
    },
    reminder: { enabled: false, localMinutes: 1140, onboardingAnswered: true },
    days: [],
    streakWeeks: 0,
    weeklyAdherenceStreak: 0,
    dailyStreakDays: 0,
    dailyStreak: 0,
    weeklyStreak: 0,
    currentWeek: { keptDays: 0, target: 0 },
    neutralWeekStarts: [],
    streakWeeksAtWindowStart: 0,
    graceCooldownRemainingAtWindowStart: 0,
    ...overrides,
  } as GoalSummary;
}

describe('resolveStreakWeek', () => {
  it('returns the seven days of the ISO week containing today', () => {
    const week = resolveStreakWeek(summary());
    expect(week).toHaveLength(7);
    expect(week[0].dayKey).toBe('2026-08-24');
    expect(week[6].dayKey).toBe('2026-08-30');
    expect(week.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('anchors today and the future on the server day key, never on the clock', () => {
    const week = resolveStreakWeek(summary());
    expect(week.filter((day) => day.isToday).map((day) => day.dayKey)).toEqual([TODAY]);
    expect(week.filter((day) => day.isFuture).map((day) => day.dayKey)).toEqual([
      '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30',
    ]);
  });

  it('fills days with no snapshot from the active goal', () => {
    const week = resolveStreakWeek(summary());
    // Mon/Wed/Fri/Sun are preferred, Tue/Thu/Sat are not.
    expect(week.map((day) => day.preferred)).toEqual([true, false, true, false, true, false, true]);
    expect(week.every((day) => day.status === 'none')).toBe(true);
  });

  it('prefers the row the server sent over the fallback', () => {
    const week = resolveStreakWeek(summary({
      days: [{
        dayKey: '2026-08-24', activeMs: 0, answeredWords: 3,
        goalDaysPerWeek: 4, goalMinutes: null, goalWords: 10, goalMode: 'words',
        goalStatus: 'active', availableNewWords: null, dueReviewCount: null,
        resolvedNewTarget: null, resolvedReviewTarget: null,
        resolvedItemBudget: null, resolvedMinutesBudget: null,
        introducedWords: 3, reviewedWords: 0, met: true,
        preferred: false, status: 'met',
      }],
    } as Partial<GoalSummary>));
    // A goal edited mid-week is why the row wins: on Monday the plan said no.
    expect(week[0].preferred).toBe(false);
    expect(week[0].status).toBe('met');
  });

  it('prefers nothing when the goal is switched off', () => {
    const off = summary();
    const week = resolveStreakWeek({
      ...off,
      goal: { ...off.goal, active: { ...off.goal.active!, enabled: false } },
    });
    expect(week.every((day) => day.preferred === false)).toBe(true);
  });

  it('draws missing days in an unmet first partial week as neutral', () => {
    const week = resolveStreakWeek(summary({
      days: [{
        dayKey: '2026-08-24', activeMs: 0, answeredWords: 0,
        goalDaysPerWeek: null, goalMinutes: null, goalWords: null, goalMode: null,
        goalStatus: 'active', availableNewWords: null, dueReviewCount: null,
        resolvedNewTarget: null, resolvedReviewTarget: null,
        resolvedItemBudget: null, resolvedMinutesBudget: null,
        introducedWords: 0, reviewedWords: 0, met: false,
        preferred: false, status: 'none',
      }],
      neutralWeekStarts: ['2026-08-24'],
    }));

    expect(week.every((day) => day.status === 'nothing_due')).toBe(true);
  });
});

describe('resolveStreakData', () => {
  it('shows a locally completed today immediately while the server rollup catches up', () => {
    const streak = resolveStreakData(summary({
      dailyStreak: 2,
      weeklyStreak: 1,
      currentWeek: { keptDays: 1, target: 2 },
    }), { optimisticTodayComplete: true });

    expect(streak?.days.find((day) => day.isToday)?.status).toBe('met');
    expect(streak).toMatchObject({
      dailyStreak: 3,
      weeklyStreak: 2,
      keptThisWeek: 2,
      weekTarget: 2,
    });
  });

  it('does not count today twice once the server has confirmed it', () => {
    const completed = summary({
      dailyStreak: 3,
      weeklyStreak: 2,
      currentWeek: { keptDays: 2, target: 2 },
    });
    completed.days = [{
      dayKey: TODAY, activeMs: 0, answeredWords: 20,
      goalDaysPerWeek: 4, goalMinutes: null, goalWords: 5, goalMode: 'words',
      goalStatus: 'active', availableNewWords: 20, dueReviewCount: 0,
      resolvedNewTarget: 5, resolvedReviewTarget: 0,
      resolvedItemBudget: 5, resolvedMinutesBudget: null,
      introducedWords: 20, reviewedWords: 0, met: true,
      preferred: true, status: 'exceeded',
    }];

    expect(resolveStreakData(completed, { optimisticTodayComplete: true })).toMatchObject({
      dailyStreak: 3,
      weeklyStreak: 2,
      keptThisWeek: 2,
    });
  });
});
