import { describe, expect, it } from 'vitest';
import type { NormalizedWord } from '@/lib/words';
import {
  buildQuickPracticeBlock,
  canQuickPractice,
  QUICK_PRACTICE_BLOCK_ROUNDS,
  rankPracticeWords,
  type PracticeStep,
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

const build = (scope: NormalizedWord[], seed: number, size?: number) =>
  buildQuickPracticeBlock({ words: scope, role: 'knownLanguage', seed, ...(size ? { size } : {}) });

/** What a card is asking, whichever kind of card it turned out to be. */
const methodOf = (step: PracticeStep): string =>
  step.kind === 'game' ? step.config.gameType : step.exercise.method;

/** The word a card is about; a game round anchors on its first word. */
const anchorOf = (step: PracticeStep): string =>
  step.kind === 'game' ? step.config.words[0].id : step.word.id;

const wordsOf = (step: PracticeStep): NormalizedWord[] =>
  step.kind === 'game' ? step.config.words : [step.word];

describe('buildQuickPracticeBlock', () => {
  it('fills a whole block from the study scope', () => {
    expect(build(words(30), 7)).toHaveLength(QUICK_PRACTICE_BLOCK_ROUNDS);
  });

  it('asks in every way the app can, instead of ten of the same question', () => {
    const methods = new Set(build(words(30), 7).map(methodOf));

    expect(methods).toEqual(
      new Set(['reveal', 'choice', 'typing', 'assembly', 'matching', 'bubbleChoice']),
    );
  });

  it('never deals more than one field of bubbles', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const bubbles = build(words(30), seed).filter((step) => methodOf(step) === 'bubbleChoice');

      expect(bubbles.length).toBeLessThanOrEqual(1);
    }
  });

  it('opens on an ordinary card rather than on the bubble field', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      expect(methodOf(build(words(30), seed)[0])).not.toBe('bubbleChoice');
    }
  });

  it('anchors every card on a word the learner actually has', () => {
    const scope = words(12);
    const ids = new Set(scope.map((word) => word.id));

    for (const step of build(scope, 3)) {
      expect(ids.has(anchorOf(step))).toBe(true);
      expect(wordsOf(step).every((word) => ids.has(word.id))).toBe(true);
    }
  });

  it('works through the scope before repeating a word', () => {
    const anchors = build(words(QUICK_PRACTICE_BLOCK_ROUNDS), 5).map(anchorOf);

    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('degrades to what a small scope can supply instead of dropping cards', () => {
    const steps = build(words(4), 2);

    expect(steps).toHaveLength(QUICK_PRACTICE_BLOCK_ROUNDS);
    // Four words cannot fill an eight-bubble field, so the round shrinks
    // rather than the block losing its turn.
    expect(steps.every((step) => wordsOf(step).length >= 2 || step.kind === 'exercise')).toBe(true);
  });

  it('skips rows that are missing a side, so no card can ask about a blank', () => {
    const broken: NormalizedWord = { id: 'blank', cz: 'known', vi: '   ', en: '', category: [] };
    const steps = build([broken, ...words(8)], 4);

    expect(steps.every((step) => wordsOf(step).every((word) => word.id !== 'blank'))).toBe(true);
  });

  it('still fills a block for a one-word scope, with the cards that need no pool', () => {
    const single = build(words(1), 1);

    expect(single).toHaveLength(QUICK_PRACTICE_BLOCK_ROUNDS);
    expect(single.every((step) => step.kind === 'exercise')).toBe(true);
    expect(new Set(single.map(methodOf))).toEqual(new Set(['reveal', 'typing', 'assembly']));
  });

  it('reshuffles between blocks but holds still within one', () => {
    const scope = words(16);
    const first = build(scope, 1);
    const again = build(scope, 1);
    const later = build(scope, 2);

    expect(first.map(anchorOf)).toEqual(again.map(anchorOf));
    expect(first.map(anchorOf)).not.toEqual(later.map(anchorOf));
  });

  it('gives up rather than looping when no card can be built at all', () => {
    const blank: NormalizedWord = { id: 'blank', cz: '', vi: '', en: '', category: [] };

    expect(build([blank], 1)).toEqual([]);
  });
});

describe('canQuickPractice', () => {
  it('turns the offer off for a scope too thin to play with', () => {
    expect(canQuickPractice(words(3))).toBe(false);
    expect(canQuickPractice(words(4))).toBe(true);
    expect(canQuickPractice(words(2), 2)).toBe(true);
    expect(canQuickPractice(words(1), 1)).toBe(true);
  });

  it('counts only rows a round could actually be built from', () => {
    const broken: NormalizedWord = { id: 'blank', cz: 'known', vi: '', en: '', category: [] };

    expect(canQuickPractice([broken, ...words(3)])).toBe(false);
  });
});

describe('rankPracticeWords', () => {
  it('leads with never-answered and then least recently answered words', () => {
    const scope = words(4);
    const ranked = rankPracticeWords(scope, {
      w0: { stageIndex: 5, knownCount: 4, unknownCount: 0, lastKnownAt: 600 },
      w1: { stageIndex: 3, knownCount: 2, unknownCount: 0, lastKnownAt: 100 },
      w2: { stageIndex: 1, knownCount: 1, unknownCount: 1, lastUnknownAt: 300 },
    });

    expect(ranked.map((word) => word.id)).toEqual(['w3', 'w1', 'w2', 'w0']);
  });

  it('uses lower stages as the tie-breaker for words seen at the same time', () => {
    const scope = words(2);
    const ranked = rankPracticeWords(scope, {
      w0: { stageIndex: 4, knownCount: 2, unknownCount: 0, lastKnownAt: 100 },
      w1: { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: 100 },
    });

    expect(ranked.map((word) => word.id)).toEqual(['w1', 'w0']);
  });
});
