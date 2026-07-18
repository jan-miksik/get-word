import { describe, expect, it } from 'vitest';
import { shuffleGameItems } from '../shuffle';

describe('shuffleGameItems', () => {
  it('returns a shuffled copy without mutating the source set', () => {
    const source = ['a', 'b', 'c', 'd'];
    const randomValues = [0.25, 0.75, 0];
    const result = shuffleGameItems(source, () => randomValues.shift() ?? 0);

    expect(result).toEqual(['d', 'a', 'c', 'b']);
    expect(source).toEqual(['a', 'b', 'c', 'd']);
  });
});
