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
    const [normalButEmpty] = simulateReviewLoad({
      goal: wordsGoal, days: 1, wordPoolSize: 1, successRate: 0.7, initialDueReviews: 23,
    });
    expect(normalButEmpty).toMatchObject({ newIntroduced: 1, reviewsDone: 23, plannedSlots: 24 });
    const [backlogged] = simulateReviewLoad({
      goal: wordsGoal, days: 1, wordPoolSize: 10, successRate: 0.7, initialDueReviews: 99,
    });
    expect(backlogged).toMatchObject({ newIntroduced: 6, reviewsDone: 27, plannedSlots: 33 });
  });
});
