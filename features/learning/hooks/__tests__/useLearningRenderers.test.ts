import { describe, expect, it } from 'vitest';

import type { ProgressData } from '@/features/sync/contracts';
import { progressForReinforcementExercise } from '../useLearningRenderers';

describe('reinforcement exercise progress', () => {
  it('uses the five-minute stage rules after a successful introduction', () => {
    const progress: ProgressData = {
      stageIndex: 2,
      knownCount: 1,
      unknownCount: 0,
      nextDueAt: 123,
    };

    expect(progressForReinforcementExercise(progress, true)).toEqual({
      ...progress,
      stageIndex: 1,
    });
  });

  it('keeps a failed first encounter on the gentle new-word rules', () => {
    const progress: ProgressData = {
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 1,
    };

    expect(progressForReinforcementExercise(progress, true)).toBe(progress);
  });

  it('does not affect ordinary review cards', () => {
    const progress: ProgressData = {
      stageIndex: 3,
      knownCount: 4,
      unknownCount: 1,
    };

    expect(progressForReinforcementExercise(progress, false)).toBe(progress);
  });
});
