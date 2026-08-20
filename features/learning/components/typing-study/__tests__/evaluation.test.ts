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
    expect(computeTypingOutcome({ match: 'exact', hints: 0, nearestExactDistance: 0, correctAnswer: 'chào', masked: true }))
      .toEqual({ match: 'exact', presentation: 'exact', outcome: 'known', points: 2 });
    expect(computeTypingOutcome({ match: 'close', hints: 0, nearestExactDistance: 1, correctAnswer: 'chào', masked: true }))
      .toEqual({ match: 'close', presentation: 'close', outcome: 'stay', points: 1 });
    expect(computeTypingOutcome({ match: 'exact', hints: 2, nearestExactDistance: 0, correctAnswer: 'chào', masked: true }))
      .toEqual({ match: 'exact', presentation: 'exact', outcome: 'stay', points: 1 });
  });

  it('rejects an answer beyond its typo budget', () => {
    expect(computeTypingOutcome({ match: 'wrong', hints: 0, nearestExactDistance: 2, correctAnswer: 'chào', masked: true }))
      .toEqual({ match: 'wrong', presentation: 'wrong', outcome: 'unknown', points: 0 });
  });

  it('accepts one masked typo as close feedback without promoting the word', () => {
    expect(evaluateTypingAnswer('xin chao', candidates, 0, true)).toMatchObject({
      match: 'close',
      presentation: 'close',
      outcome: 'stay',
      points: 1,
    });
    expect(evaluateTypingAnswer('xin chàq', candidates, 0, true)).toMatchObject({
      match: 'wrong',
      presentation: 'typo',
      outcome: 'stay',
      points: 1,
    });
  });

  it('reports a matching accepted alternative without changing its outcome', () => {
    expect(evaluateTypingAnswer('chao', candidates, 0, false)).toEqual({
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
