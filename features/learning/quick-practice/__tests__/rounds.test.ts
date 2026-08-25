import { describe, expect, it } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import {
  availableQuickPracticeMethods,
  buildQuickPracticeRounds,
  QUICK_PRACTICE_ROUNDS,
} from '../rounds';

const makeWord = (id: string): NormalizedWord => ({
  id,
  cz: `known-${id}`,
  vi: `target-${id}`,
  en: '',
  category: ['word'],
});

const words = (count: number, prefix = 'w') =>
  Array.from({ length: count }, (_, index) => makeWord(`${prefix}${index}`));

describe('buildQuickPracticeRounds', () => {
  it('anchors every round on a word the learner just added', () => {
    const fresh = words(3, 'new');
    const pool = words(20, 'old');

    for (const method of ['choice', 'matching', 'bubbles'] as const) {
      const rounds = buildQuickPracticeRounds(method, { fresh, pool, seed: 7 });
      expect(rounds.length).toBeGreaterThan(0);
      for (const round of rounds) {
        expect(fresh.some((word) => word.id === round.words[0].id)).toBe(true);
      }
    }
  });

  it('stays a short detour rather than a session', () => {
    const rounds = buildQuickPracticeRounds('choice', {
      fresh: words(30, 'new'),
      pool: words(30, 'old'),
      seed: 3,
    });

    expect(rounds).toHaveLength(QUICK_PRACTICE_ROUNDS);
  });

  it('never asks about the same fresh word twice in one run', () => {
    const rounds = buildQuickPracticeRounds('choice', {
      fresh: words(8, 'new'),
      pool: words(8, 'old'),
      seed: 11,
    });
    const anchors = rounds.map((round) => round.words[0].id);

    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('lets one matching round stand in for every word it already covers', () => {
    const fresh = words(4, 'new');
    const rounds = buildQuickPracticeRounds('matching', { fresh, pool: [], seed: 5 });

    // Four words fit in a single round; a second one would only repeat them.
    expect(rounds).toHaveLength(1);
    expect(rounds[0].words).toHaveLength(4);
  });

  it('degrades to what the batch can supply instead of dropping the round', () => {
    const rounds = buildQuickPracticeRounds('choice', {
      fresh: words(3, 'new'),
      pool: [],
      seed: 2,
    });

    expect(rounds.length).toBeGreaterThan(0);
    expect(rounds[0].words).toHaveLength(3);
  });

  it('offers nothing at all when there is not enough to ask with', () => {
    expect(availableQuickPracticeMethods({ fresh: words(1), pool: [], seed: 1 })).toEqual([]);
  });

  it('offers only the methods the words on hand can actually play', () => {
    // Two words make a matching pair, but not a three-option question.
    expect(availableQuickPracticeMethods({ fresh: words(2), pool: [], seed: 1 })).toEqual([
      'matching',
    ]);
    expect(availableQuickPracticeMethods({ fresh: words(6), pool: [], seed: 1 })).toEqual([
      'choice',
      'matching',
      'bubbles',
    ]);
  });

  it('skips rows that are missing a side, so no round can ask about a blank', () => {
    const broken: NormalizedWord = { id: 'blank', cz: 'known', vi: '   ', en: '', category: [] };
    const rounds = buildQuickPracticeRounds('choice', {
      fresh: [broken, ...words(3, 'new')],
      pool: [],
      seed: 4,
    });

    expect(rounds.every((round) => round.words.every((word) => word.id !== 'blank'))).toBe(true);
  });

  it('reshuffles between runs but holds still within one', () => {
    const input = { fresh: words(6, 'new'), pool: words(10, 'old') };
    const first = buildQuickPracticeRounds('choice', { ...input, seed: 1 });
    const again = buildQuickPracticeRounds('choice', { ...input, seed: 1 });
    const later = buildQuickPracticeRounds('choice', { ...input, seed: 2 });

    expect(first.map((round) => round.words[0].id)).toEqual(
      again.map((round) => round.words[0].id),
    );
    expect(first.map((round) => round.words[0].id)).not.toEqual(
      later.map((round) => round.words[0].id),
    );
  });
});
