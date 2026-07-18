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
  it('keeps the existing score and outcome thresholds', () => {
    expect(computeTypingOutcome('exact', 0)).toEqual({ match: 'exact', outcome: 'known', points: 2 });
    expect(computeTypingOutcome('close', 1)).toEqual({ match: 'close', outcome: 'stay', points: 1 });
    expect(computeTypingOutcome('exact', 2)).toEqual({ match: 'exact', outcome: 'unknown', points: 0 });
  });

  it('reports a matching accepted alternative without changing its outcome', () => {
    expect(evaluateTypingAnswer('chao', candidates, 0)).toEqual({
      match: 'close',
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
