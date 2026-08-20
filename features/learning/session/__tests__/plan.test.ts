import { describe, expect, it } from 'vitest';
import { planSession } from '../plan';

const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });
const goal = { id: 'g', effectiveFromDay: '2026-08-19', enabled: true, daysPerWeek: 4, minutesPerDay: 10, wordsPerDay: 5, preset: 'medium' as const, pacing: { revealMode: 'scratch' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } } };

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

  it('starts ramp-up plans with a new block', () => {
    const plan = planSession({
      goal, priorityWords: [], dueWords: Array.from({ length: 8 }, (_, i) => word(`d${i}`)),
      newWords: Array.from({ length: 4 }, (_, i) => word(`n${i}`)), progress: {}, absenceDays: 7,
    });
    expect(plan.reason).toBe('rampUp');
    expect(plan.blocks[0]?.kind).toBe('new');
  });
});
