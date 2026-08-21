import { describe, expect, it } from 'vitest';

import { adjustNewTargetForBacklog, resolveGoalTargets } from '../calibration';
import { simulateReviewLoad } from '../forecast';
import type { StudyPacing } from '../goal';

const pacing: StudyPacing = {
  revealMode: 'press', minigameFrequency: 'off', fineTune: { version: 3, stages: [] },
};
const wordsGoal = { mode: 'words' as const, minutesPerDay: 10, wordsPerDay: 10, newWordsPerDay: 10, pacing };

describe('words goal policy', () => {
  it('uses a 30/70 unique-slot split', () => {
    expect(resolveGoalTargets(wordsGoal)).toMatchObject({ desiredNew: 10, itemBudget: 33, desiredReviewTarget: 23 });
  });

  it('never reduces new words below the twenty-percent floor', () => {
    expect(adjustNewTargetForBacklog(10, 33 * 3, 33)).toBe(6);
    expect(adjustNewTargetForBacklog(10, 33 * 9, 33)).toBe(2);
  });

  it('moves backlog capacity to review but does not replace unavailable new words', () => {
    const normalButEmpty = simulateReviewLoad({ goal: wordsGoal, days: 1, availableNewWords: 1, dueReviewCount: 23, seed: 2 })[0];
    expect(normalButEmpty).toMatchObject({ newTarget: 1, reviewTarget: 23, plannedSlots: 24 });
    const backlogged = simulateReviewLoad({ goal: wordsGoal, days: 1, availableNewWords: 10, dueReviewCount: 99, seed: 2 })[0];
    expect(backlogged).toMatchObject({ newTarget: 6, reviewTarget: 27, plannedSlots: 33 });
  });

  it('is seeded and exposes intra-day returns as answer events', () => {
    const input = { goal: wordsGoal, days: 3, availableNewWords: 30, dueReviewCount: 23, seed: 42 };
    const first = simulateReviewLoad(input);
    expect(simulateReviewLoad(input)).toEqual(first);
    expect(first[0].answerEvents).toBeGreaterThan(first[0].plannedSlots);
  });
});
