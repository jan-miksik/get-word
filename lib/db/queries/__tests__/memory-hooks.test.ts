import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();

vi.mock('../../client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import { batchUpsertMemoryHooks } from '../memory-hooks';

describe('batchUpsertMemoryHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  it('splits legacy word hooks from word-list item hooks', async () => {
    const itemId = '11111111-1111-4111-8111-111111111111';

    await batchUpsertMemoryHooks('user-1', {
      w001: 'legacy hook',
      [itemId]: 'item hook',
    });

    expect(mockValues).toHaveBeenCalledWith([
      { userId: 'user-1', wordId: 'w001', hookText: 'legacy hook' },
    ]);
    expect(mockValues).toHaveBeenCalledWith([
      { userId: 'user-1', wordListItemId: itemId, hookText: 'item hook' },
    ]);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(2);
  });
});
