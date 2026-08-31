import { describe, expect, it } from 'vitest';
import { planSessionBlocks, planTimeSessionBlocks } from '../blocks';

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

function sizes(blocks: ReturnType<typeof planSessionBlocks>) {
  return blocks.map((block) => `${block.kind[0].toUpperCase()}${block.ids.length}${(block.pass ?? 1) > 1 ? `x${block.pass}` : ''}`);
}

describe('planSessionBlocks', () => {
  it('opens on repeats for a learner who already has words', () => {
    expect(sizes(planSessionBlocks({ reviewIds: ids('r', 9), newIds: ids('n', 4) })))
      .toEqual(['R9', 'N4']);
  });

  it('keeps a large day to the same two stretches', () => {
    expect(sizes(planSessionBlocks({ reviewIds: ids('r', 20), newIds: ids('n', 20) })))
      .toEqual(['R20', 'N20']);
  });

  it('opens on new words for a first day, and closes on a second pass over them', () => {
    const blocks = planSessionBlocks({ reviewIds: [], newIds: ids('n', 6), fillWithRepeats: true });
    expect(sizes(blocks)).toEqual(['N6', 'R6x2']);
    expect(blocks[1].ids).toEqual(blocks[0].ids);
    expect(blocks[1].reinforcement).toBe(true);
  });

  it('opens on new ground after a long absence, repeats behind it', () => {
    expect(sizes(planSessionBlocks({ reviewIds: ids('r', 9), newIds: ids('n', 4), openOnNew: true })))
      .toEqual(['N4', 'R9']);
  });

  it('leaves a first day without repeats alone when repeats are not wanted', () => {
    expect(sizes(planSessionBlocks({ reviewIds: [], newIds: ids('n', 6) }))).toEqual(['N6']);
  });

  it('is never more than two stretches, and preserves every bucket in order', () => {
    for (const review of [0, 1, 5, 13, 20]) {
      for (let newCount = 0; newCount <= 12; newCount += 1) {
        for (const openOnNew of [false, true]) {
          const input = { reviewIds: ids('r', review), newIds: ids('n', newCount), openOnNew };
          const blocks = planSessionBlocks(input);
          expect(blocks.length).toBeLessThanOrEqual(2);
          expect(blocks.every((block) => block.ids.length > 0)).toBe(true);
          expect(blocks.filter((block) => block.kind === 'new').flatMap((block) => block.ids))
            .toEqual(input.newIds);
          expect(blocks.filter((block) => block.kind === 'review').flatMap((block) => block.ids))
            .toEqual(input.reviewIds);
          // Repeats lead unless there are none, or the caller asked otherwise.
          if (review > 0 && newCount > 0) {
            expect(blocks[0].kind).toBe(openOnNew ? 'new' : 'review');
          }
        }
      }
    }
  });

  it('handles degenerate buckets', () => {
    expect(planSessionBlocks({ reviewIds: [], newIds: [] })).toEqual([]);
    expect(planSessionBlocks({ reviewIds: [], newIds: ['n0'] }))
      .toEqual([{ key: 'new-0', kind: 'new', ids: ['n0'] }]);
    expect(planSessionBlocks({ reviewIds: ['r0'], newIds: [] }))
      .toEqual([{ key: 'review-0', kind: 'review', ids: ['r0'] }]);
  });
});

describe('planTimeSessionBlocks', () => {
  it('uses old reviews, new words, then reinforcement as its three stretches', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 22), newIds: ids('n', 10),
    });

    expect(blocks.map((block) => [block.kind, block.phase, block.ids.length]))
      .toEqual([['review', 0, 22], ['new', 1, 10], ['review', 2, 10]]);
    expect(blocks[2]).toMatchObject({ pass: 2, reinforcement: true });
    expect(blocks[2].ids).toEqual(blocks[1].ids);
  });

  it('splits a first day into learning and reinforcing the same new words', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: [], newIds: ids('n', 6),
    });

    expect(blocks.map((block) => [block.kind, block.phase, block.pass ?? 1]))
      .toEqual([['new', 0, 1], ['review', 1, 2]]);
    // The closing stretch is a second pass over the very words just met, so a
    // day without repeats of its own still ends on consolidation.
    expect(blocks.at(-1)?.ids).toEqual(ids('n', 6));
    expect(blocks.at(-1)?.reinforcement).toBe(true);
  });

  it('still opens on due reviews after a long absence', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 10), newIds: ids('n', 8),
    });

    expect(blocks[0]).toMatchObject({ kind: 'review', phase: 0 });
    expect(blocks[1]).toMatchObject({ kind: 'new', phase: 1 });
    expect(blocks[2]).toMatchObject({ kind: 'review', phase: 2, reinforcement: true });
  });

  it('never spends the closing stretch on untouched new words', () => {
    const blocks = planTimeSessionBlocks({
      reviewIds: ids('r', 4), newIds: ids('n', 16),
    });

    const closing = blocks.filter((block) => block.phase === 2);
    expect(closing.map((block) => block.kind)).toEqual(['review']);
    expect(closing[0].ids).toEqual(ids('n', 16));
    expect(closing[0].reinforcement).toBe(true);
  });

  it('plans nothing at all when there is nothing to study', () => {
    expect(planTimeSessionBlocks({ reviewIds: [], newIds: [] })).toEqual([]);
  });
});
