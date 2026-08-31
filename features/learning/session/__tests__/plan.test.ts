import { describe, expect, it } from 'vitest';
import { planSession } from '../plan';

const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });
const goal = { id: 'g', effectiveFromDay: '2026-08-19', enabled: true, mode: 'minutes' as const, daysPerWeek: 4, weekdays: null, minutesPerDay: 10, wordsPerDay: 5, newWordsPerDay: null, preset: 'medium' as const, pacing: { revealMode: 'scratch' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } } };

describe('planSession', () => {
  it('keeps new words within the proportional minutes target', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 20 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 10 }, (_, i) => word(`n${i}`)), progress: {},
    });
    expect(plan.dueIds).toHaveLength(1);
    expect(plan.newIds).toHaveLength(2);
    expect(plan.blocks.map((block) => block.kind)).toEqual(['review', 'new', 'review']);
    expect(plan.blocks[2]).toMatchObject({ ids: plan.newIds, reinforcement: true });
  });

  it('removes the cap only for continue-anyway', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 8 }, (_, i) => word(`d${i}`)),
      newWords: [], progress: {}, continueAnyway: true,
    });
    expect(plan.sessionItemCap).toBeNull();
    expect(plan.dueIds).toHaveLength(8);
    expect(plan.blocks).toEqual([]);
  });

  it('shapes an ordinary words day as repeats then new words', () => {
    const roomy = { ...goal, mode: 'words' as const, wordsPerDay: 40, newWordsPerDay: 10 };
    const plan = planSession({
      goal: roomy, priorityWords: [],
      dueWords: Array.from({ length: 40 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 30 }, (_, i) => word(`n${i}`)),
      progress: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`d${i}`, { stageIndex: 2, knownCount: 2, unknownCount: 0 }]),
      ),
      dayTargets: { resolvedNewTarget: 10, resolvedReviewTarget: 22, resolvedItemBudget: 32 },
    });
    expect(plan.blocks.map((block) => block.kind)).toEqual(['review', 'new']);
    // New words are capped by their share of the day, and the leftover repeats
    // are offered rather than planned.
    expect(plan.newIds).toHaveLength(10);
    expect(plan.blocks[0].ids).toHaveLength(22);
    expect(plan.blocks[1].ids).toHaveLength(10);
    expect(plan.deferredDueCount).toBe(18);
    expect(plan.shortfall).toBe(0);
  });

  it('uses the selected goal while today\'s server snapshot is still empty', () => {
    const firstSession = { ...goal, mode: 'words' as const, wordsPerDay: 5, newWordsPerDay: 5 };
    const plan = planSession({
      goal: firstSession,
      priorityWords: [],
      dueWords: [],
      newWords: Array.from({ length: 5 }, (_, i) => word(`new-${i}`)),
      progress: {},
      // A goal-summary read can create a measurement row before the first
      // study event has frozen its target fields.
      dayTargets: { resolvedNewTarget: null, resolvedReviewTarget: null, resolvedItemBudget: 17 },
    });

    expect(plan.newIds).toHaveLength(5);
    expect(plan.blocks).not.toEqual([]);
  });

  it('adds reinforcement when a frozen words day has new words but no due reviews', () => {
    const firstSession = { ...goal, mode: 'words' as const, wordsPerDay: 5, newWordsPerDay: 5 };
    const plan = planSession({
      goal: firstSession,
      priorityWords: [],
      dueWords: [],
      newWords: Array.from({ length: 5 }, (_, i) => word(`new-${i}`)),
      progress: {},
      dayTargets: { resolvedNewTarget: 5, resolvedReviewTarget: 0, resolvedItemBudget: 17 },
    });

    expect(plan.blocks.map((block) => ({
      kind: block.kind,
      ids: block.ids,
      pass: block.pass ?? 1,
      reinforcement: block.reinforcement ?? false,
    }))).toEqual([
      {
        kind: 'new',
        ids: ['new-0', 'new-1', 'new-2', 'new-3', 'new-4'],
        pass: 1,
        reinforcement: false,
      },
      {
        kind: 'review',
        ids: ['new-0', 'new-1', 'new-2', 'new-3', 'new-4'],
        pass: 2,
        reinforcement: true,
      },
    ]);
    expect(plan.answerBaseline).toEqual({
      'new-0': 0,
      'new-1': 0,
      'new-2': 0,
      'new-3': 0,
      'new-4': 0,
    });
  });

  it('reopens a stale zero target when newly committed words are live', () => {
    const firstSession = { ...goal, mode: 'words' as const, wordsPerDay: 5, newWordsPerDay: 5 };
    const plan = planSession({
      goal: firstSession,
      priorityWords: Array.from({ length: 5 }, (_, i) => word(`committed-${i}`)),
      dueWords: [],
      newWords: [],
      progress: {},
      // Activity tracking froze the day before the add-words commit finished.
      dayTargets: { resolvedNewTarget: 0, resolvedReviewTarget: 0, resolvedItemBudget: 5 },
    });

    expect(plan.newIds).toHaveLength(5);
    expect(plan.blocks[0]).toMatchObject({ kind: 'new' });
  });

  it('cuts a minutes day into its three time stretches', () => {
    const roomy = { ...goal, wordsPerDay: 40 };
    const plan = planSession({
      goal: roomy, priorityWords: [],
      dueWords: Array.from({ length: 40 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 30 }, (_, i) => word(`n${i}`)),
      progress: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`d${i}`, { stageIndex: 2, knownCount: 2, unknownCount: 0 }]),
      ),
    });
    // New words are a proportional quota, not an open-ended inventory.
    expect(plan.blocks.map((block) => [block.kind, block.phase, block.ids.length]))
      .toEqual([['review', 0, 10], ['new', 1, 11], ['review', 2, 11]]);
    expect(plan.newIds).toHaveLength(11);
    expect(plan.deferredDueCount).toBe(30);
    expect(plan.shortfall).toBe(0);
    expect(plan.timePhaseShares).toHaveLength(3);
    expect(plan.timePhaseShares?.[0]).toBeCloseTo(10 / 32);
    expect(plan.timePhaseShares?.[1]).toBeCloseTo(11 / 32);
    expect(plan.timePhaseShares?.[2]).toBeCloseTo(11 / 32);
  });

  it('never plans more than twenty new words, however long the day is', () => {
    const long = { ...goal, wordsPerDay: 150 };
    const plan = planSession({
      goal: long, priorityWords: [], dueWords: [],
      newWords: Array.from({ length: 60 }, (_, i) => word(`n${i}`)), progress: {},
    });
    expect(plan.newIds).toHaveLength(20);
  });

  it('closes a first day on a second pass and reports what the goal is short', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: [],
      newWords: Array.from({ length: 2 }, (_, i) => word(`n${i}`)), progress: {},
    });
    expect(plan.blocks.map((block) => [block.kind, block.pass ?? 1])).toEqual([['new', 1], ['review', 2]]);
    expect(plan.answerBaseline).toEqual({ n0: 0, n1: 0 });
    // Five answer events fit: two introductions plus two reinforcements leave
    // one event unstocked.
    expect(plan.shortfall).toBe(1);
    expect(plan.newShortfall).toBe(0);
    expect(plan.timePhaseShares).toEqual([0.5, 0.5]);
  });

  it('reports new words the lists could not supply', () => {
    const roomy = { ...goal, wordsPerDay: 40 };
    const plan = planSession({
      goal: roomy, priorityWords: [], dueWords: Array.from({ length: 40 }, (_, i) => word(`d${i}`)),
      newWords: [word('n0')], progress: {},
    });
    expect(plan.newShortfall).toBe(10);
  });

  it('does not complete a seven-word goal on repeats alone', () => {
    const sevenNewWords = {
      ...goal,
      mode: 'words' as const,
      wordsPerDay: 7,
      newWordsPerDay: 7,
    };
    const plan = planSession({
      goal: sevenNewWords,
      priorityWords: [],
      dueWords: Array.from({ length: 3 }, (_, i) => word(`due-${i}`)),
      newWords: [],
      progress: Object.fromEntries(
        Array.from({ length: 3 }, (_, i) => [
          `due-${i}`,
          { stageIndex: 2, knownCount: 2, unknownCount: 0 },
        ]),
      ),
      dayTargets: {
        resolvedNewTarget: 7,
        resolvedReviewTarget: 3,
        resolvedItemBudget: 23,
      },
    });

    expect(plan.dueIds).toHaveLength(3);
    expect(plan.newIds).toHaveLength(0);
    expect(plan.shortfall).toBe(7);
    expect(plan.newShortfall).toBe(7);
  });

  it('keeps due reviews first in a minutes plan after a long absence', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 8 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 4 }, (_, i) => word(`n${i}`)), progress: {}, absenceDays: 7,
    });
    expect(plan.reason).toBe('rampUp');
    expect(plan.blocks[0]?.kind).toBe('review');
  });

  it('gives a large backlog more time without pushing new introductions below thirty percent', () => {
    const plan = planSession({
      goal: { ...goal, wordsPerDay: 40 },
      priorityWords: [],
      dueWords: Array.from({ length: 100 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 30 }, (_, i) => word(`n${i}`)),
      progress: Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`d${i}`, { stageIndex: 2, knownCount: 2, unknownCount: 0 }]),
      ),
    });

    expect(plan.timePhaseShares?.[0]).toBeCloseTo(12 / 32);
    expect(plan.timePhaseShares?.[1]).toBeCloseTo(10 / 32);
    expect(plan.timePhaseShares?.[1] ?? 0).toBeGreaterThanOrEqual(0.3);
    expect(plan.timePhaseShares?.[1]).toBeCloseTo(plan.timePhaseShares?.[2] ?? 0);
    expect(plan.blocks.map((block) => block.kind)).toEqual(['review', 'new', 'review']);
    expect(plan.blocks[1].ids).toEqual(plan.blocks[2].ids);
  });

  it('shrinks a short opening review and hands the time to new material', () => {
    const plan = planSession({
      goal: { ...goal, wordsPerDay: 40 },
      priorityWords: [],
      dueWords: [word('due-1'), word('due-2')],
      newWords: Array.from({ length: 20 }, (_, i) => word(`n${i}`)),
      progress: {
        'due-1': { stageIndex: 2, knownCount: 2, unknownCount: 0 },
        'due-2': { stageIndex: 2, knownCount: 2, unknownCount: 0 },
      },
    });

    expect(plan.timePhaseShares?.[0]).toBeCloseTo(2 / 24);
    expect(plan.timePhaseShares?.[1]).toBeCloseTo(11 / 24);
    expect(plan.timePhaseShares?.[2]).toBeCloseTo(11 / 24);
    expect(Math.max(...(plan.timePhaseShares ?? []))).toBeLessThanOrEqual(0.5);
  });
});
