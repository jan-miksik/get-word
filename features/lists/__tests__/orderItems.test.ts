import { describe, expect, it } from 'vitest';
import { orderItemsByCategoryDisplay } from '@/features/lists/orderItems';
import type { WordCategory, WordListItem } from '@/features/lists/types';

function category(id: string, position: number): WordCategory {
  return { id, listId: 'list', name: id, position, isSystem: false };
}

function item(id: string, categoryId: string | null, position: number): WordListItem {
  return {
    id,
    listId: 'list',
    categoryId,
    position,
    textKnown: id,
    textTarget: id,
    translationStatus: 'translated',
    audioStatus: 'none',
    notes: null,
  };
}

describe('orderItemsByCategoryDisplay', () => {
  it('groups items by category display order, then item position', () => {
    // Categories are ordered B(0) then A(1); item positions interleave them.
    const categories = [category('B', 0), category('A', 1)];
    const items = [
      item('a1', 'A', 0),
      item('b1', 'B', 1),
      item('a2', 'A', 2),
      item('b2', 'B', 3),
    ];

    const ordered = orderItemsByCategoryDisplay(items, categories).map((i) => i.id);

    expect(ordered).toEqual(['b1', 'b2', 'a1', 'a2']);
  });

  it('sorts uncategorized items last, by position', () => {
    const categories = [category('A', 0)];
    const items = [
      item('u2', null, 5),
      item('a1', 'A', 1),
      item('u1', null, 3),
    ];

    const ordered = orderItemsByCategoryDisplay(items, categories).map((i) => i.id);

    expect(ordered).toEqual(['a1', 'u1', 'u2']);
  });

  it('does not mutate the input array', () => {
    const categories = [category('A', 0)];
    const items = [item('a2', 'A', 2), item('a1', 'A', 1)];

    orderItemsByCategoryDisplay(items, categories);

    expect(items.map((i) => i.id)).toEqual(['a2', 'a1']);
  });
});
