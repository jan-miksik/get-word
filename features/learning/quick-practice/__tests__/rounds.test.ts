import { describe, expect, it } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import {
  buildQuickPracticeBlock,
  canQuickPractice,
  QUICK_PRACTICE_BLOCK_ROUNDS,
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

describe('buildQuickPracticeBlock', () => {
  it('fills a whole block from the study scope', () => {
    const rounds = buildQuickPracticeBlock({ words: words(30), seed: 7 });

    expect(rounds).toHaveLength(QUICK_PRACTICE_BLOCK_ROUNDS);
  });

  it('mixes the exercises instead of asking the same one ten times', () => {
    const rounds = buildQuickPracticeBlock({ words: words(30), seed: 7 });
    const types = new Set(rounds.map((round) => round.gameType));

    expect(types).toEqual(new Set(['multipleChoice', 'matching', 'bubbleChoice']));
  });

  it('anchors every round on a word the learner actually has', () => {
    const scope = words(12);
    const ids = new Set(scope.map((word) => word.id));
    const rounds = buildQuickPracticeBlock({ words: scope, seed: 3 });

    for (const round of rounds) {
      expect(ids.has(round.words[0].id)).toBe(true);
      expect(round.words.every((word) => ids.has(word.id))).toBe(true);
    }
  });

  it('works through the scope before repeating a word', () => {
    const rounds = buildQuickPracticeBlock({ words: words(QUICK_PRACTICE_BLOCK_ROUNDS), seed: 5 });
    const anchors = rounds.map((round) => round.words[0].id);

    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('degrades to what a small scope can supply instead of dropping rounds', () => {
    const rounds = buildQuickPracticeBlock({ words: words(4), seed: 2 });

    expect(rounds).toHaveLength(QUICK_PRACTICE_BLOCK_ROUNDS);
    // Four words cannot fill an eight-bubble field, so the round shrinks
    // rather than the block losing its turn.
    expect(rounds.every((round) => round.words.length >= 3)).toBe(true);
  });

  it('skips rows that are missing a side, so no round can ask about a blank', () => {
    const broken: NormalizedWord = { id: 'blank', cz: 'known', vi: '   ', en: '', category: [] };
    const rounds = buildQuickPracticeBlock({ words: [broken, ...words(8)], seed: 4 });

    expect(rounds.every((round) => round.words.every((word) => word.id !== 'blank'))).toBe(true);
  });

  it('builds nothing at all when there is not enough to ask with', () => {
    expect(buildQuickPracticeBlock({ words: words(1), seed: 1 })).toEqual([]);
  });

  it('reshuffles between blocks but holds still within one', () => {
    const scope = words(16);
    const first = buildQuickPracticeBlock({ words: scope, seed: 1 });
    const again = buildQuickPracticeBlock({ words: scope, seed: 1 });
    const later = buildQuickPracticeBlock({ words: scope, seed: 2 });

    expect(first.map((round) => round.words[0].id)).toEqual(
      again.map((round) => round.words[0].id),
    );
    expect(first.map((round) => round.words[0].id)).not.toEqual(
      later.map((round) => round.words[0].id),
    );
  });
});

describe('canQuickPractice', () => {
  it('turns the offer off for a scope too thin to play with', () => {
    expect(canQuickPractice(words(3))).toBe(false);
    expect(canQuickPractice(words(4))).toBe(true);
  });

  it('counts only rows a round could actually be built from', () => {
    const broken: NormalizedWord = { id: 'blank', cz: 'known', vi: '', en: '', category: [] };

    expect(canQuickPractice([broken, ...words(3)])).toBe(false);
  });
});
