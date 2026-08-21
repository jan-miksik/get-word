import { describe, expect, it } from 'vitest';
import { planSessionBlocks } from '../blocks';

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

function sizes(blocks: ReturnType<typeof planSessionBlocks>) {
  return blocks.map((block) => `${block.kind[0].toUpperCase()}${block.ids.length}${(block.pass ?? 1) > 1 ? `x${block.pass}` : ''}`);
}

describe('planSessionBlocks', () => {
  it('shapes an ordinary day as warm-up, new, closing review', () => {
    expect(sizes(planSessionBlocks({ warmUpIds: ids('w', 3), newIds: ids('n', 4), closingReviewIds: ids('r', 6) })))
      .toEqual(['R3', 'N4', 'R6']);
  });

  it('splits a large batch of new words and keeps review between the passes', () => {
    expect(sizes(planSessionBlocks({ warmUpIds: ids('w', 7), newIds: ids('n', 20), closingReviewIds: ids('r', 13) })))
      .toEqual(['R7', 'N7', 'R5', 'N7', 'R4', 'N6', 'R4']);
  });

  it('closes a day with no repeats of its own on a second pass over today\'s new words', () => {
    const blocks = planSessionBlocks({ warmUpIds: [], newIds: ids('n', 6), closingReviewIds: [], fillWithRepeats: true });
    expect(sizes(blocks)).toEqual(['N6', 'R6x2']);
    expect(blocks[1].ids).toEqual(blocks[0].ids);
  });

  it('leaves a first day without repeats alone when repeats are not wanted', () => {
    expect(sizes(planSessionBlocks({ warmUpIds: [], newIds: ids('n', 6), closingReviewIds: [] }))).toEqual(['N6']);
  });

  it('preserves every bucket in order and ends a mixed day on review', () => {
    for (let warmUp = 0; warmUp <= 7; warmUp += 1) {
      for (let newCount = 0; newCount <= 12; newCount += 1) {
        for (const closing of [0, 1, 5, 13]) {
          const input = { warmUpIds: ids('w', warmUp), newIds: ids('n', newCount), closingReviewIds: ids('r', closing) };
          const blocks = planSessionBlocks(input);
          expect(blocks.every((block) => block.ids.length > 0)).toBe(true);
          expect(blocks.filter((block) => block.kind === 'new').flatMap((block) => block.ids)).toEqual(input.newIds);
          expect(blocks.filter((block) => block.kind === 'review').flatMap((block) => block.ids))
            .toEqual([...input.warmUpIds, ...input.closingReviewIds]);
          if (closing > 0 && newCount > 0) expect(blocks.at(-1)?.kind).toBe('review');
        }
      }
    }
  });

  it('handles degenerate buckets', () => {
    expect(planSessionBlocks({ warmUpIds: [], newIds: [], closingReviewIds: [] })).toEqual([]);
    expect(planSessionBlocks({ warmUpIds: [], newIds: ['n0'], closingReviewIds: [] }))
      .toEqual([{ key: 'new-0', kind: 'new', ids: ['n0'] }]);
    expect(planSessionBlocks({ warmUpIds: ['r0'], newIds: [], closingReviewIds: [] }))
      .toEqual([{ key: 'review-0', kind: 'review', ids: ['r0'] }]);
  });
});
