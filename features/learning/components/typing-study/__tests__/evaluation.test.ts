import { describe, expect, it } from 'vitest';
import {
  computeTypingOutcome,
  evaluateTypingAnswer,
  getMinimumTypingAnswerLength,
} from '../evaluation';

const candidates = [
  { answer: 'xin chào', isAlternative: false },
  { answer: 'chào', isAlternative: true },
];

describe('typing study evaluation', () => {
  it('promotes only exact answers without hints', () => {
    expect(computeTypingOutcome({ match: 'exact', hints: 0, nearestLetterDistance: 0 }))
      .toEqual({ match: 'exact', presentation: 'exact', outcome: 'known', points: 2 });
    expect(computeTypingOutcome({ match: 'close', hints: 0, nearestLetterDistance: 0 }))
      .toEqual({ match: 'close', presentation: 'close', outcome: 'stay', points: 1 });
    expect(computeTypingOutcome({ match: 'exact', hints: 2, nearestLetterDistance: 0 }))
      .toEqual({ match: 'exact', presentation: 'exact', outcome: 'stay', points: 1 });
  });

  it('rejects an answer that changed a letter, not just its marks', () => {
    expect(computeTypingOutcome({ match: 'wrong', hints: 0, nearestLetterDistance: 1 }))
      .toEqual({ match: 'wrong', presentation: 'wrong', outcome: 'unknown', points: 0 });
  });

  it('marks a swapped letter wrong and a re-dressed one close', () => {
    // "u" and "y" are two letters, not one letter written two ways.
    expect(evaluateTypingAnswer('byt', [{ answer: 'but', isAlternative: false }], 0))
      .toMatchObject({ match: 'wrong', presentation: 'wrong', outcome: 'unknown', points: 0 });
    expect(evaluateTypingAnswer('hloubka', [{ answer: 'hloubky', isAlternative: false }], 0))
      .toMatchObject({ presentation: 'wrong', outcome: 'unknown' });
    // Same letters, different marks — the mistake the card is meant to forgive.
    expect(evaluateTypingAnswer('bạn', [{ answer: 'bán', isAlternative: false }], 0))
      .toMatchObject({ match: 'close', presentation: 'close', outcome: 'stay', points: 1 });
    expect(evaluateTypingAnswer('dong', [{ answer: 'đồng', isAlternative: false }], 0))
      .toMatchObject({ match: 'close', presentation: 'close', outcome: 'stay', points: 1 });
    expect(evaluateTypingAnswer('an', [{ answer: 'ăn', isAlternative: false }], 0))
      .toMatchObject({ match: 'close', presentation: 'close', outcome: 'stay', points: 1 });
  });

  it('forgives a mark on a letter the close key does not fold, but nothing more', () => {
    expect(evaluateTypingAnswer('lodz', [{ answer: 'łódź', isAlternative: false }], 0))
      .toMatchObject({ match: 'wrong', presentation: 'typo', outcome: 'stay', points: 1 });
    // A missing letter is a different word, however long the answer is.
    expect(evaluateTypingAnswer('xin cao', [{ answer: 'xin chào', isAlternative: false }], 0))
      .toMatchObject({ presentation: 'wrong', outcome: 'unknown' });
  });

  it('accepts a mark-only miss without promoting the word', () => {
    expect(evaluateTypingAnswer('xin chao', candidates, 0)).toMatchObject({
      match: 'close',
      presentation: 'close',
      outcome: 'stay',
      points: 1,
    });
    expect(evaluateTypingAnswer('xin chàq', candidates, 0)).toMatchObject({
      match: 'wrong',
      presentation: 'wrong',
      outcome: 'unknown',
      points: 0,
    });
  });

  it('reports a matching accepted alternative without changing its outcome', () => {
    expect(evaluateTypingAnswer('chao', candidates, 0)).toEqual({
      match: 'close',
      presentation: 'close',
      matchedAnswer: 'chào',
      isAlternative: true,
      outcome: 'stay',
      points: 1,
    });
  });

  it('uses the shortest accepted answer only for free input', () => {
    expect(getMinimumTypingAnswerLength(candidates, true, 8)).toBe(4);
    expect(getMinimumTypingAnswerLength(candidates, false, 8)).toBe(8);
  });
});
