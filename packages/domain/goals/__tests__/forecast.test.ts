import { describe, expect, it } from 'vitest';

import { STAGES } from '@/lib/words';
import { MATURE_STAGE, MAX_STAGE, STAGE_INTERVAL_DAYS, simulateReviewLoad } from '../forecast';
import type { StudyPacing } from '../goal';

const pacing: StudyPacing = {
  revealMode: 'press', minigameFrequency: 'off', fineTune: { version: 3, stages: [] },
};
const wordsGoal = {
  mode: 'words' as const, minutesPerDay: 10, wordsPerDay: 10, newWordsPerDay: 10, pacing,
};

const run = (overrides: Partial<Parameters<typeof simulateReviewLoad>[0]> = {}) =>
  simulateReviewLoad({ goal: wordsGoal, days: 60, wordPoolSize: 500, successRate: 0.7, ...overrides });

describe('review load forecast', () => {
  it('mirrors the live stage table', () => {
    expect(STAGE_INTERVAL_DAYS.map((days) => Math.round(days * 24 * 60 * 60 * 1000)))
      .toEqual(STAGES.map((stage) => stage.intervalMs));
    expect(MAX_STAGE).toBe(STAGES.length - 1);
    expect(STAGES[MATURE_STAGE].name).toBe('14 days');
  });

  it('never introduces a word twice, however often it is forgotten', () => {
    // A learner who forgets almost everything keeps cycling words through stage
    // 0. Those are re-learnt, not newly introduced.
    const forgetful = run({ successRate: 0.15, days: 200, wordPoolSize: 120 });
    for (const day of forgetful) {
      expect(day.introducedEver).toBeLessThanOrEqual(120);
      expect(day.introducedEver + day.unseenRemaining).toBeCloseTo(120, 6);
    }
    expect(forgetful.at(-1)!.forgottenDue).toBeGreaterThan(0);
  });

  it('stops introducing once the lists run out', () => {
    const tiny = run({ wordPoolSize: 12, days: 30 });
    expect(tiny.at(-1)!.unseenRemaining).toBe(0);
    expect(tiny.at(-1)!.newIntroduced).toBe(0);
    expect(simulateReviewLoad({ goal: wordsGoal, days: 5, wordPoolSize: 0, successRate: 0.7 })
      .every((day) => day.newIntroduced === 0)).toBe(true);
  });

  it('counts the five-minute return as an extra answer, not an extra slot', () => {
    const [first] = run();
    expect(first.plannedSlots).toBe(first.newIntroduced + first.reviewsDone);
    expect(first.answerEvents).toBeGreaterThan(first.plannedSlots);
    // Only the successful share comes back after five minutes.
    expect(first.answerEvents).toBeCloseTo(first.plannedSlots + first.newIntroduced * 0.7, 6);
  });

  it('moves the five-minute cohort off stage 1 instead of parking it there', () => {
    // Were the return only counted and never answered, the mass would stay on a
    // five-minute interval and every later day would be swamped by it.
    const steady = run({ successRate: 1, days: 8, wordPoolSize: 500 });
    // Day two sees exactly yesterday's ten introductions back on the one-day stage.
    expect(steady[1].dueReviews).toBeCloseTo(10, 6);
  });

  it('rolls a skipped day forward without answering anything', () => {
    const everyOtherDay = run({ studyDayPattern: (day) => day % 2 === 0, days: 6 });
    const skipped = everyOtherDay[1];
    expect(skipped.studied).toBe(false);
    expect(skipped.answerEvents).toBe(0);
    expect(skipped.newIntroduced).toBe(0);
    expect(skipped.backlog).toBeCloseTo(skipped.dueReviews, 6);
    expect(everyOtherDay[2].dueReviews).toBeGreaterThanOrEqual(skipped.dueReviews);
  });

  it('applies the backlog brake to new words', () => {
    const clear = run({ days: 1 });
    const buried = run({ days: 1, initialDueReviews: 300 });
    expect(clear[0].newIntroduced).toBe(10);
    expect(buried[0].newIntroduced).toBeLessThan(clear[0].newIntroduced);
    expect(buried[0].newIntroduced).toBeGreaterThanOrEqual(2);
  });

  it('separates words that stick from words that keep slipping', () => {
    const solid = run({ successRate: 0.9, days: 120 }).at(-1)!;
    const shaky = run({ successRate: 0.4, days: 120 }).at(-1)!;
    expect(solid.matureWords).toBeGreaterThan(shaky.matureWords);
    expect(shaky.forgottenDue).toBeGreaterThan(solid.forgottenDue);
  });

  it('shows a steady goal outgrowing its own review budget over a year', () => {
    // Ten new words a day buys 23 review slots. Long intervals stretch the load
    // out, but they never remove it, so the backlog eventually wins — which is
    // the whole reason this forecast exists.
    const year = run({ days: 365, wordPoolSize: 4000, successRate: 0.7 });
    expect(year).toHaveLength(365);
    expect(year.every((day) => Number.isFinite(day.answerEvents))).toBe(true);
    expect(year.at(-1)!.backlog).toBeGreaterThan(year[30].backlog);
    expect(year.at(-1)!.estimatedMinutes).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    expect(run({ days: 40 })).toEqual(run({ days: 40 }));
  });
});
