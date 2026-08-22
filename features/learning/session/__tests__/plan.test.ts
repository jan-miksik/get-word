import { describe, expect, it } from 'vitest';
import { planSession } from '../plan';

const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });
const goal = { id: 'g', effectiveFromDay: '2026-08-19', enabled: true, mode: 'minutes' as const, daysPerWeek: 4, weekdays: null, minutesPerDay: 10, wordsPerDay: 5, newWordsPerDay: null, preset: 'medium' as const, pacing: { revealMode: 'scratch' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } } };

describe('planSession', () => {
  it('never exposes more distinct words than the word goal', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 20 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 10 }, (_, i) => word(`n${i}`)), progress: {},
    });
    expect([...plan.priorityIds, ...plan.dueIds, ...plan.newIds]).toHaveLength(5);
    expect(plan.newIds.length).toBeGreaterThan(0);
    expect(plan.blocks.filter((block) => block.kind === 'review').flatMap((block) => block.ids))
      .toEqual([...plan.priorityIds, ...plan.dueIds]);
    expect(plan.blocks.filter((block) => block.kind === 'new').flatMap((block) => block.ids))
      .toEqual(plan.newIds);
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

  it('shapes an ordinary day as warm-up, new words, closing review', () => {
    const roomy = { ...goal, wordsPerDay: 40 };
    const plan = planSession({
      goal: roomy, priorityWords: [],
      dueWords: Array.from({ length: 40 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 30 }, (_, i) => word(`n${i}`)),
      progress: Object.fromEntries(
        Array.from({ length: 40 }, (_, i) => [`d${i}`, { stageIndex: 2, knownCount: 2, unknownCount: 0 }]),
      ),
    });
    expect(plan.blocks.map((block) => block.kind)).toEqual(['review', 'new', 'review']);
    // New words are capped by their share of the day, the warm-up by its own
    // ceiling, and the leftover repeats are offered rather than planned.
    expect(plan.newIds).toHaveLength(10);
    expect(plan.blocks[0].ids).toHaveLength(7);
    expect(plan.blocks.at(-1)?.ids).toHaveLength(15);
    expect(plan.deferredDueCount).toBe(18);
    expect(plan.shortfall).toBe(0);
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
    // Five items fit in the goal, two distinct words exist: the day cannot be
    // earned on count, so the closing card offers more words instead.
    expect(plan.shortfall).toBe(3);
    expect(plan.newShortfall).toBe(0);
  });

  it('reports new words the lists could not supply', () => {
    const roomy = { ...goal, wordsPerDay: 40 };
    const plan = planSession({
      goal: roomy, priorityWords: [], dueWords: Array.from({ length: 40 }, (_, i) => word(`d${i}`)),
      newWords: [word('n0')], progress: {},
    });
    expect(plan.newShortfall).toBe(9);
  });

  it('starts ramp-up plans with a new block', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 8 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 4 }, (_, i) => word(`n${i}`)), progress: {}, absenceDays: 7,
    });
    expect(plan.reason).toBe('rampUp');
    expect(plan.blocks[0]?.kind).toBe('new');
  });
});
