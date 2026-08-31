import { describe, expect, it } from 'vitest';

import type { ProgressData } from '@/features/sync/contracts';
import { captureTimedReinforcement, resolveTimedStream } from '../timedStream';

const word = (id: string) => ({ id, cz: id, vi: id, en: '', category: [] });

function resolve(overrides: Partial<Parameters<typeof resolveTimedStream>[0]> = {}) {
  return resolveTimedStream({
    phase: 0,
    phaseKinds: ['new', 'review'],
    priorityWords: [],
    priorityDueCount: 0,
    dueWords: [],
    newWords: [word('n1'), word('n2'), word('n3')],
    allWords: [word('n1'), word('n2'), word('n3')],
    progress: {},
    reinforcement: null,
    ...overrides,
  });
}

describe('resolveTimedStream', () => {
  it('serves the whole live new pool instead of a compatibility item quota', () => {
    expect(resolve().block?.words.map((entry) => entry.id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('never falls from a new phase into its future reinforcement', () => {
    const result = resolve({ newWords: [] });
    expect(result.block).toBeNull();
    expect(result.emptyKind).toBe('new');
  });

  it('hands an exhausted opening review to live new words', () => {
    const result = resolve({ phaseKinds: ['review', 'new', 'review'] });
    expect(result.activeKind).toBe('new');
    expect(result.block?.kind).toBe('new');
  });

  it('serves only one closing answer above the boundary baseline', () => {
    const today = Date.parse('2026-08-29T10:00:00Z');
    const progress: Record<string, ProgressData> = {
      n1: { stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: today },
      n2: { stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: today },
    };
    const words = [word('n1'), word('n2')];
    const snapshot = captureTimedReinforcement({
      phase: 1,
      dayKey: '2026-08-29',
      timezone: 'UTC',
      words,
      progress,
    });
    const first = resolve({
      phase: 1,
      newWords: [],
      allWords: words,
      progress,
      reinforcement: snapshot,
    });
    expect(first.block?.words.map((entry) => entry.id)).toEqual(['n1', 'n2']);

    const afterOneAnswer = resolve({
      phase: 1,
      newWords: [],
      allWords: words,
      progress,
      pendingAnswers: { n1: 1 },
      reinforcement: snapshot,
    });
    expect(afterOneAnswer.block?.words.map((entry) => entry.id)).toEqual(['n2']);
  });
});
