import { describe, expect, it } from 'vitest';

import type { ProgressData } from '@/features/sync/contracts';
import {
  commitExerciseOutcome,
  progressForReinforcementExercise,
} from '../useLearningRenderers';
import { vi } from 'vitest';

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

describe('exercise outcome persistence', () => {
  it('records a same-stage answer as a review event instead of a custom-stage write', () => {
    const actions = {
      markKnown: vi.fn(),
      markStay: vi.fn(),
      markUnknown: vi.fn(),
      setCustomStage: vi.fn(),
    };

    commitExerciseOutcome('w1', 3, 'stay', false, actions);

    expect(actions.markStay).toHaveBeenCalledWith('w1');
    expect(actions.setCustomStage).not.toHaveBeenCalled();
  });

  // The reveal card in the immediate second pass offers only Continue, which
  // reports 'stay'. That has to land as a completed pass — the stage and the
  // five-minute due date the introduction set stay exactly where they were.
  it('records the second pass from a Continue tap without moving the schedule', () => {
    const actions = {
      markKnown: vi.fn(),
      markStay: vi.fn(),
      markUnknown: vi.fn(),
      setCustomStage: vi.fn(),
    };

    commitExerciseOutcome('w1', 1, 'stay', true, actions);

    expect(actions.setCustomStage).toHaveBeenCalledWith('w1', 1, { countAsKnown: true });
    expect(actions.markStay).not.toHaveBeenCalled();
    expect(actions.markKnown).not.toHaveBeenCalled();
  });
});
