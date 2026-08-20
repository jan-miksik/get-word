import { describe, expect, it } from 'vitest';
import { planSessionBlocks } from '../blocks';

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

function sizes(blocks: ReturnType<typeof planSessionBlocks>) {
  return blocks.map((block) => `${block.kind[0].toUpperCase()}${block.ids.length}`);
}

describe('planSessionBlocks', () => {
  it('uses the normative daily-goal distributions', () => {
    expect(sizes(planSessionBlocks(ids('r', 12), ids('n', 3)))).toEqual(['R2', 'N2', 'R5', 'N1', 'R5']);
    expect(sizes(planSessionBlocks(ids('r', 10), ids('n', 5)))).toEqual(['R2', 'N3', 'R4', 'N2', 'R4']);
    expect(sizes(planSessionBlocks(ids('r', 42), ids('n', 11)))).toEqual(['R6', 'N4', 'R12', 'N4', 'R12', 'N3', 'R12']);
    expect(sizes(planSessionBlocks(ids('r', 37), ids('n', 16)))).toEqual(['R5', 'N6', 'R11', 'N5', 'R11', 'N5', 'R10']);
    expect(sizes(planSessionBlocks(ids('r', 96), ids('n', 24)))).toEqual(['R9', 'N5', 'R18', 'N5', 'R18', 'N5', 'R17', 'N5', 'R17', 'N4', 'R17']);
    expect(sizes(planSessionBlocks(ids('r', 84), ids('n', 36)))).toEqual(['R8', 'N8', 'R16', 'N7', 'R15', 'N7', 'R15', 'N7', 'R15', 'N7', 'R15']);
  });

  it('preserves both buckets and always ends a mixed plan with review', () => {
    for (let reviewCount = 0; reviewCount <= 12; reviewCount += 1) {
      for (let newCount = 0; newCount <= 12; newCount += 1) {
        const review = ids('r', reviewCount);
        const fresh = ids('n', newCount);
        const blocks = planSessionBlocks(review, fresh);
        expect(blocks.every((block) => block.ids.length > 0)).toBe(true);
        expect(blocks.filter((block) => block.kind === 'review').flatMap((block) => block.ids)).toEqual(review);
        expect(blocks.filter((block) => block.kind === 'new').flatMap((block) => block.ids)).toEqual(fresh);
        if (reviewCount > 0 && newCount > 0) expect(blocks.at(-1)?.kind).toBe('review');
      }
    }
  });

  it('starts with new after a long absence and handles degenerate buckets', () => {
    const returning = planSessionBlocks(ids('r', 37), ids('n', 16), { leadWithNew: true });
    expect(sizes(returning)).toEqual(['N6', 'R13', 'N5', 'R12', 'N5', 'R12']);
    expect(planSessionBlocks([], [])).toEqual([]);
    expect(planSessionBlocks([], ['n0'])).toEqual([{ key: 'new-0', kind: 'new', ids: ['n0'] }]);
    expect(planSessionBlocks(['r0'], [])).toEqual([{ key: 'review-0', kind: 'review', ids: ['r0'] }]);
    expect(sizes(planSessionBlocks(['r0'], ids('n', 5)))).toEqual(['N5', 'R1']);
  });
});
