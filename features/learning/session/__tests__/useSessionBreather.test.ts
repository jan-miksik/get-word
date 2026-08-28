import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { NormalizedWord } from '@/lib/words';

import type { SessionBlockProgress } from '../dayProgress';
import { resolveSessionFlow } from '../flow';
import { useSessionBreather } from '../useSessionBreather';

const word = (id: string): NormalizedWord =>
  ({ id, cz: id, vi: id, en: id, category: ['word'] }) as NormalizedWord;

/** A three-block day: six repeats, four new words, then twelve repeats. */
const plan = (doneInFirst: number, doneInSecond = 0): SessionBlockProgress[] => [
  { key: 'review-0', kind: 'review', total: 6, done: doneInFirst, pending: 0, liveRemaining: 6 - doneInFirst, unavailable: 0 },
  { key: 'new-0', kind: 'new', total: 4, done: doneInSecond, pending: 0, liveRemaining: 4 - doneInSecond, unavailable: 0 },
  { key: 'review-1', kind: 'review', total: 12, done: 0, pending: 0, liveRemaining: 12, unavailable: 0 },
];

function renderBreather() {
  return renderHook(
    ({ blocks, answers }: { blocks: SessionBlockProgress[]; answers: NormalizedWord[] }) =>
      useSessionBreather(resolveSessionFlow(blocks), blocks, answers),
    { initialProps: { blocks: plan(0), answers: [] as NormalizedWord[] } },
  );
}

describe('useSessionBreather', () => {
  it('fires at the seam and hands over every word the finished block took', () => {
    const { result, rerender } = renderBreather();
    expect(result.current.breather).toBeNull();

    // The block is answered one word at a time; each answer re-renders.
    const answers: NormalizedWord[] = [];
    for (let index = 1; index <= 6; index += 1) {
      answers.push(word(`w${index}`));
      rerender({ blocks: plan(index), answers: [...answers] });
    }

    expect(result.current.breather?.finished.key).toBe('review-0');
    expect(result.current.breather?.next.key).toBe('new-0');
    // Not just the answer that happened to tip the block over.
    expect(result.current.breather?.words.map((entry) => entry.id)).toEqual([
      'w1', 'w2', 'w3', 'w4', 'w5', 'w6',
    ]);
  });

  it('gives the next seam only its own block, not everything answered today', () => {
    const { result, rerender } = renderBreather();
    const answers: NormalizedWord[] = [];
    for (let index = 1; index <= 6; index += 1) {
      answers.push(word(`w${index}`));
      rerender({ blocks: plan(index), answers: [...answers] });
    }
    for (let index = 1; index <= 4; index += 1) {
      answers.push(word(`n${index}`));
      rerender({ blocks: plan(6, index), answers: [...answers] });
    }

    expect(result.current.breather?.finished.key).toBe('new-0');
    expect(result.current.breather?.words.map((entry) => entry.id)).toEqual([
      'n1', 'n2', 'n3', 'n4',
    ]);
  });

  it('starts a fresh answer slice when the active plan changes', () => {
    const oldAnswer = word('day-answer');
    const bonusAnswer = word('bonus-answer');
    const bonus = (firstDone: number): SessionBlockProgress[] => [
      { key: 'bonus-review-0', kind: 'review', total: 1, done: firstDone, pending: 0, liveRemaining: 1 - firstDone, unavailable: 0 },
      { key: 'bonus-review-1', kind: 'review', total: 1, done: 0, pending: 0, liveRemaining: 1, unavailable: 0 },
    ];
    const { result, rerender } = renderHook(
      ({ blocks, answers, scope }) =>
        useSessionBreather(resolveSessionFlow(blocks), blocks, answers, scope),
      {
        initialProps: {
          blocks: plan(0),
          answers: [oldAnswer],
          scope: 'day',
        },
      },
    );

    rerender({ blocks: bonus(0), answers: [oldAnswer], scope: 'bonus' });
    rerender({ blocks: bonus(1), answers: [oldAnswer, bonusAnswer], scope: 'bonus' });

    expect(result.current.breather?.words.map((entry) => entry.id)).toEqual(['bonus-answer']);
  });
});
