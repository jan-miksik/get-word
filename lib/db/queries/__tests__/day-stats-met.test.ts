import { describe, expect, it, vi } from 'vitest';

// `isDayGoalMet` is pure, but its module reaches the db client on import.
vi.mock('@/lib/db/client', () => ({ db: {} }));

import { isDayGoalMet, type DayGoalMetInput } from '@/lib/db/queries/day-stats';

const wordsDay = (overrides: Partial<DayGoalMetInput> = {}): DayGoalMetInput => ({
  goalEnabled: true,
  mode: 'words',
  hasWordsSnapshot: true,
  status: 'active',
  introducedWords: 0,
  reviewedWords: 0,
  resolvedNewTarget: 10,
  resolvedReviewTarget: 23,
  answeredWords: 0,
  activeMs: 0,
  minuteItemBudget: 0,
  minuteBudgetMs: 0,
  ...overrides,
});

describe('isDayGoalMet', () => {
  describe('words mode', () => {
    it('earns the day on new words alone when nothing was due to repeat', () => {
      // The whole point of the snapshot: a learner with an empty backlog is not
      // held hostage to repeats that do not exist.
      expect(isDayGoalMet(wordsDay({
        resolvedReviewTarget: 0, introducedWords: 10, reviewedWords: 0,
      }))).toBe(true);
    });

    it('still wants the repeats the day was sized for when there is a backlog', () => {
      expect(isDayGoalMet(wordsDay({ introducedWords: 10, reviewedWords: 5 }))).toBe(false);
      expect(isDayGoalMet(wordsDay({ introducedWords: 10, reviewedWords: 23 }))).toBe(true);
    });

    it('never earns the day on repeats alone', () => {
      expect(isDayGoalMet(wordsDay({ introducedWords: 7, reviewedWords: 23 }))).toBe(false);
    });

    it('counts an overshoot on either side', () => {
      expect(isDayGoalMet(wordsDay({ introducedWords: 14, reviewedWords: 40 }))).toBe(true);
    });

    it('refuses a day whose targets have not been frozen yet', () => {
      // A measurement row created by a summary refresh carries null targets;
      // reading those as zero would earn the day without any study at all.
      expect(isDayGoalMet(wordsDay({
        hasWordsSnapshot: false, resolvedNewTarget: null, resolvedReviewTarget: null,
      }))).toBe(false);
    });

    it('does not earn a day that had nothing to offer', () => {
      expect(isDayGoalMet(wordsDay({
        status: 'nothing_due', resolvedNewTarget: 0, resolvedReviewTarget: 0,
      }))).toBe(false);
    });

    it('ignores the clock entirely', () => {
      expect(isDayGoalMet(wordsDay({
        introducedWords: 0, activeMs: 60 * 60_000, minuteBudgetMs: 10 * 60_000,
      }))).toBe(false);
    });
  });

  describe('minutes mode', () => {
    const minutesDay = (overrides: Partial<DayGoalMetInput> = {}): DayGoalMetInput => wordsDay({
      mode: 'minutes', resolvedNewTarget: null, resolvedReviewTarget: null,
      minuteItemBudget: 20, minuteBudgetMs: 10 * 60_000, ...overrides,
    });

    it('earns the day on the session length', () => {
      expect(isDayGoalMet(minutesDay({ answeredWords: 20 }))).toBe(true);
    });

    it('keeps the clock as the safety net for a learner short of words', () => {
      expect(isDayGoalMet(minutesDay({ answeredWords: 3, activeMs: 10 * 60_000 }))).toBe(true);
    });

    it('fails a day that reached neither', () => {
      expect(isDayGoalMet(minutesDay({ answeredWords: 3, activeMs: 60_000 }))).toBe(false);
    });
  });

  it('never earns a day without an enabled goal', () => {
    expect(isDayGoalMet(wordsDay({ goalEnabled: false, introducedWords: 99, reviewedWords: 99 }))).toBe(false);
  });
});
