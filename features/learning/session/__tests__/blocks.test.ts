import { describe, expect, it } from 'vitest';
import { planSessionBlocks, planTimeSessionBlocks } from '../blocks';

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
    expect(blocks[1].reinforcement).toBe(true);
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

describe('planTimeSessionBlocks', () => {
  it('gives each stretch its share of the day, repeats first', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 22), newIds: ids('n', 10), itemBudget: 32,
    });

    expect(blocks.map((block) => [block.kind, block.phase, block.ids.length]))
      .toEqual([['review', 0, 10], ['new', 1, 10], ['review', 2, 12]]);
  });

  it('opens on new ground when there is nothing to repeat', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: [], newIds: ids('n', 6), itemBudget: 10, fillWithRepeats: true,
    });

    expect(blocks.map((block) => [block.kind, block.phase, block.pass ?? 1]))
      .toEqual([['new', 0, 1], ['new', 1, 1], ['review', 2, 2]]);
    // The closing stretch is a second pass over the very words just met, so a
    // day without repeats of its own still ends on consolidation.
    expect(blocks.at(-1)?.ids).toEqual(ids('n', 6));
    expect(blocks.at(-1)?.reinforcement).toBe(true);
  });

  it('opens on new ground after a long absence rather than on the backlog', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 10), newIds: ids('n', 8), itemBudget: 18, openOnNew: true,
    });

    expect(blocks[0].kind).toBe('new');
    expect(blocks.filter((block) => block.kind === 'review').flatMap((block) => block.ids))
      .toEqual(ids('r', 10));
  });

  it('leaves the new words the earlier stretches could not hold for the closing one', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 4), newIds: ids('n', 16), itemBudget: 20,
    });

    // Four repeats do not fill the opening stretch, so the closing one has no
    // repeats left to spend its time on and takes the new words instead.
    const closing = blocks.filter((block) => block.phase === 2);
    expect(closing.map((block) => block.kind)).toEqual(['new']);
    expect(closing[0].ids).toEqual(['n6', 'n7', 'n8', 'n9', 'n10', 'n11', 'n12', 'n13', 'n14', 'n15']);
  });

  it('plans nothing at all when there is nothing to study', () => {
    expect(planTimeSessionBlocks({ reviewIds: [], newIds: [], itemBudget: 10 })).toEqual([]);
  });
});
