import { describe, expect, it } from 'vitest';

import {
  adjustNewTargetForBacklog,
  estimateWordsSessionSeconds,
  resolveGoalTargets,
  resolveWordsDayTargets,
} from '../calibration';
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

  // The displayed time has to cover the cards the session actually deals: every
  // new word is introduced and then reinforced in the same session, so it owns
  // two of them, not the one its slot in `itemBudget` suggests.
  it('prices the day as repeats plus two cards per new word', () => {
    const graded: StudyPacing = {
      revealMode: 'press',
      minigameFrequency: 'off',
      fineTune: {
        version: 3,
        stages: [
          {
            reveal: { weight: 1, variants: ['press'] },
            choice: { weight: 0, variants: [] },
            typing: { weight: 0, variants: [] },
            assembly: { weight: 0, variants: [] },
          },
          {
            reveal: { weight: 0, variants: [] },
            choice: { weight: 0, variants: [] },
            typing: { weight: 1, variants: ['typing'] },
            assembly: { weight: 0, variants: [] },
          },
        ],
      },
    };
    // Reveal costs 8s and typing 20s, so a repeat averages 14s and a new card,
    // drawn from the first band alone, costs 8s.
    expect(estimateWordsSessionSeconds({ desiredNew: 5, desiredReviewTarget: 12 }, graded))
      .toBe((12 * 14) + (2 * 5 * 8));
    expect(resolveGoalTargets({ ...wordsGoal, newWordsPerDay: 5, pacing: graded }).minutesPerDay).toBe(5);
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

  it('keeps the new-word promise when only repeats are available', () => {
    const targets = resolveGoalTargets({ ...wordsGoal, newWordsPerDay: 7, wordsPerDay: 7 });

    expect(resolveWordsDayTargets(targets, 3)).toEqual({
      newTarget: 7,
      reviewTarget: 3,
    });
  });
});
