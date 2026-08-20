import { describe, expect, it } from 'vitest';
import { calculateWordGoal, estimateSecondsPerItem, sessionItemCapFromWordGoal } from '../calibration';
import type { StudyPacing } from '../goal';

const pacing = (revealMode: 'scratch' | 'press'): StudyPacing => ({
  revealMode,
  minigameFrequency: 'off',
  fineTune: { version: 3, stages: [{
    reveal: { weight: 1, variants: ['foreign'] },
    choice: { weight: 1, variants: [] },
    typing: { weight: 1, variants: [] },
    assembly: { weight: 1, variants: [] },
  }] },
});

describe('goal calibration', () => {
  it('sizes the session by the time budget and leaves the word target above it', () => {
    const result = calculateWordGoal(100, pacing('scratch'));
    expect(result.baseItems).toBe(120);
    // The word target is the alternative finish line for a fast learner, so it
    // sits above what the clock actually fits.
    expect(result.goalWords).toBe(150);
    // The session itself is only ever as long as the time budget.
    expect(result.sessionItemCap).toBe(120);
  });

  it('keeps a ten-minute goal to ten minutes of items', () => {
    const result = calculateWordGoal(10, pacing('scratch'));
    expect(result.sessionItemCap).toBe(result.baseItems);
    expect(result.goalWords).toBeGreaterThan(result.sessionItemCap);
  });

  it('recovers the session length from a stored word goal', () => {
    for (const minutes of [5, 10, 20, 45]) {
      const { goalWords, sessionItemCap } = calculateWordGoal(minutes, pacing('press'));
      // Only `goalWords` is persisted, so the inverse has to land back on the
      // session length to within the rounding in `calculateWordGoal`.
      expect(Math.abs(sessionItemCapFromWordGoal(goalWords) - sessionItemCap)).toBeLessThanOrEqual(1);
    }
  });

  it('recognises press reveal as slower than scratch', () => {
    expect(estimateSecondsPerItem(pacing('press'))).toBeGreaterThan(estimateSecondsPerItem(pacing('scratch')));
  });
});

describe('goal calibration robustness', () => {
  const broken = (overrides: Partial<StudyPacing>): StudyPacing => ({
    ...pacing('press'),
    ...overrides,
  });

  it('survives a reveal mode that is not one', () => {
    const result = calculateWordGoal(10, broken({ revealMode: 'wobble' as unknown as 'press' }));
    expect(Number.isFinite(result.sessionItemCap)).toBe(true);
    expect(result.sessionItemCap).toBeGreaterThan(0);
  });

  it('survives an empty method ladder', () => {
    const result = calculateWordGoal(10, broken({
      fineTune: { version: 3, stages: [] },
    }));
    expect(Number.isFinite(result.goalWords)).toBe(true);
    expect(result.goalWords).toBeGreaterThan(0);
  });

  it('survives a nonsense minigame frequency', () => {
    const result = calculateWordGoal(10, broken({
      minigameFrequency: { min: Number.NaN, max: Number.NaN },
    }));
    expect(Number.isFinite(result.sessionItemCap)).toBe(true);
  });
});
