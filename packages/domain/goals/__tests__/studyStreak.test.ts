import { describe, expect, it } from 'vitest';

import {
  calculateDailyStreak,
  calculateWeeklyStreak,
  preferredForDay,
  resolveGoalWeek,
  resolveDayStatus,
  type DayStatsInput,
  type DayStatus,
  type StreakDayInput,
} from '../studyStreak';

function wordsDay(overrides: Partial<DayStatsInput> = {}): DayStatsInput {
  return {
    met: true, goalStatus: 'active', goalMode: 'words',
    answeredWords: 10, activeMs: 300_000,
    introducedWords: 5, reviewedWords: 5,
    resolvedNewTarget: 5, resolvedReviewTarget: 5,
    resolvedItemBudget: 10, resolvedMinutesBudget: 10,
    ...overrides,
  };
}

describe('resolveDayStatus', () => {
  it('separates "did nothing" from "did something but fell short"', () => {
    expect(resolveDayStatus(wordsDay({ met: false, answeredWords: 0 }))).toBe('none');
    expect(resolveDayStatus(wordsDay({ met: false, answeredWords: 3 }))).toBe('partial');
  });

  it('does not call time alone "partial" — a card left open is not study', () => {
    const idled = wordsDay({ met: false, answeredWords: 0, activeMs: 600_000 });
    expect(resolveDayStatus(idled)).toBe('none');
  });

  it('marks a day well past the target as exceeded', () => {
    // Target is 10 all told, so 15 is the 1.5x threshold.
    expect(resolveDayStatus(wordsDay({ introducedWords: 7, reviewedWords: 8 }))).toBe('exceeded');
    expect(resolveDayStatus(wordsDay({ introducedWords: 7, reviewedWords: 7 }))).toBe('met');
  });

  it('counts repeats towards going further, not just new words', () => {
    // A day spent clearing a backlog went further too.
    const backlog = wordsDay({ introducedWords: 5, reviewedWords: 20 });
    expect(resolveDayStatus(backlog)).toBe('exceeded');
  });

  it('judges a minutes day on either items or time', () => {
    const base: Partial<DayStatsInput> = { goalMode: 'minutes', resolvedItemBudget: 20, resolvedMinutesBudget: 10 };
    expect(resolveDayStatus(wordsDay({ ...base, answeredWords: 30 }))).toBe('exceeded');
    expect(resolveDayStatus(wordsDay({ ...base, answeredWords: 20, activeMs: 15 * 60_000 }))).toBe('exceeded');
    expect(resolveDayStatus(wordsDay({ ...base, answeredWords: 20, activeMs: 10 * 60_000 }))).toBe('met');
  });

  it('never promotes a day with no target to exceeded', () => {
    const noTarget = wordsDay({ resolvedNewTarget: 0, resolvedReviewTarget: 0 });
    expect(resolveDayStatus(noTarget)).toBe('met');
  });

  it('keeps nothing_due out of the win/lose axis entirely', () => {
    expect(resolveDayStatus(wordsDay({ goalStatus: 'nothing_due', met: false }))).toBe('nothing_due');
  });
});

describe('preferredForDay', () => {
  it('reports a preference, not an obligation', () => {
    // 2026-08-24 is a Monday, 2026-08-25 a Tuesday.
    expect(preferredForDay({ weekdays: [1, 3, 5, 7] }, '2026-08-24')).toBe(true);
    expect(preferredForDay({ weekdays: [1, 3, 5, 7] }, '2026-08-25')).toBe(false);
  });

  it('has no answer when the goal names no weekdays', () => {
    expect(preferredForDay({ weekdays: null }, '2026-08-24')).toBeNull();
  });
});

describe('calculateDailyStreak', () => {
  const TODAY = '2026-08-27';
  function day(dayKey: string, status: DayStatus, hasGoal = true): StreakDayInput {
    return { dayKey, status, hasGoal };
  }

  it('counts consecutive days that met the goal', () => {
    expect(calculateDailyStreak([
      day('2026-08-27', 'met'),
      day('2026-08-26', 'exceeded'),
      day('2026-08-25', 'met'),
      day('2026-08-24', 'none'),
    ], TODAY)).toBe(3);
  });

  it('breaks on a partial day, because the goal was not met', () => {
    expect(calculateDailyStreak([
      day('2026-08-27', 'met'),
      day('2026-08-26', 'partial'),
      day('2026-08-25', 'met'),
    ], TODAY)).toBe(1);
  });

  it('never lets today end the run while it is still open', () => {
    const openToday = [day('2026-08-27', 'none'), day('2026-08-26', 'met'), day('2026-08-25', 'met')];
    expect(calculateDailyStreak(openToday, TODAY)).toBe(2);

    const partialToday = [day('2026-08-27', 'partial'), day('2026-08-26', 'met')];
    expect(calculateDailyStreak(partialToday, TODAY)).toBe(1);
  });

  it('steps over days that had nothing due, and days before the goal', () => {
    expect(calculateDailyStreak([
      day('2026-08-27', 'met'),
      day('2026-08-26', 'nothing_due'),
      day('2026-08-25', 'met'),
      day('2026-08-24', 'none', false),
      day('2026-08-23', 'met'),
    ], TODAY)).toBe(3);
  });
});

describe('calculateWeeklyStreak', () => {
  function week(keptDays: number, target = 4, extra: Partial<{ active: boolean; inProgress: boolean }> = {}) {
    return { active: true, keptDays, target, inProgress: false, ...extra };
  }

  it('counts a week as kept on the number of days, whichever days they were', () => {
    expect(calculateWeeklyStreak([week(4), week(5), week(4)])).toBe(3);
  });

  it('breaks on a finished week that fell short', () => {
    expect(calculateWeeklyStreak([week(4), week(3), week(4)])).toBe(1);
  });

  it('leaves the current week pending rather than failing it early', () => {
    // Two days in on a four-day goal: the rest of the week is still available.
    expect(calculateWeeklyStreak([week(2, 4, { inProgress: true }), week(4), week(4)])).toBe(2);
  });

  it('counts the current week as soon as its quota is filled', () => {
    expect(calculateWeeklyStreak([week(4, 4, { inProgress: true }), week(4)])).toBe(2);
  });

  it('skips weeks with no goal instead of breaking on them', () => {
    expect(calculateWeeklyStreak([week(4), week(0, 0, { active: false }), week(4)])).toBe(2);
  });
});

describe('resolveGoalWeek', () => {
  const day = (
    hasGoal: boolean,
    daysPerWeek: number | null,
    status: DayStatus = 'none',
  ) => ({ hasGoal, daysPerWeek, status });

  it('lets an achievable goal started midweek count normally', () => {
    const week = resolveGoalWeek([
      day(false, null, 'nothing_due'),
      day(false, null, 'nothing_due'),
      day(true, 3, 'met'),
      day(true, 3, 'met'),
      day(true, 3, 'met'),
      day(true, 3),
      day(true, 3),
    ], false);

    expect(week).toMatchObject({
      active: true,
      keptDays: 3,
      target: 3,
      partialStartNeutral: false,
    });
  });

  it('keeps a first partial week below quota neutral rather than failed', () => {
    const week = resolveGoalWeek([
      ...Array.from({ length: 5 }, () => day(false, null, 'nothing_due')),
      day(true, 4, 'met'),
      day(true, 4, 'met'),
    ], false);

    expect(week).toMatchObject({
      active: false,
      keptDays: 2,
      target: 4,
      partialStartNeutral: true,
    });
  });

  it('does not punish an unfinished first partial week before it can be completed', () => {
    const week = resolveGoalWeek([
      day(false, null, 'nothing_due'),
      day(false, null, 'nothing_due'),
      day(true, 3, 'met'),
      day(true, 3),
      day(true, 3),
      day(true, 3),
      day(true, 3),
    ], true);

    expect(week).toMatchObject({
      active: true,
      keptDays: 1,
      target: 3,
      inProgress: true,
      partialStartNeutral: false,
    });
  });

  it('preserves an established Monday target through later goal changes', () => {
    const week = resolveGoalWeek([
      day(true, 4, 'met'),
      day(true, 4, 'met'),
      day(true, 2),
      day(true, 2),
      day(true, 2),
      day(true, 2),
      day(true, 2),
    ], false);

    expect(week).toMatchObject({ active: true, target: 4, partialStartNeutral: false });
  });
});
