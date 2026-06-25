import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../../client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import { batchUpsertMemoryHooks, mergeHooksToSurvivor } from '../memory-hooks';

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

describe('mergeHooksToSurvivor', () => {
  const FROM = 'from-item';
  const TO = 'survivor-item';

  // Queue the two `select()` reads the function performs: first the live hooks
  // on the duplicate, then the existing hooks on the survivor.
  function setup(fromHooks: unknown[], survivorHooks: unknown[]) {
    const selectResults = [fromHooks, survivorHooks];
    mockSelect.mockImplementation(() => ({
      from: () => ({ where: () => Promise.resolve(selectResults.shift() ?? []) }),
    }));
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });
    mockUpdate.mockReturnValue({ set: () => ({ where: () => Promise.resolve([]) }) });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('repoints a hook when the survivor has none for that user', async () => {
    setup(
      [{ id: 'h1', userId: 'u1', hookText: 'dup note', updatedAt: new Date('2024-01-01'), deletedAt: null }],
      [],
    );

    await mergeHooksToSurvivor(FROM, TO);

    // Upserts the duplicate's text onto the survivor, then soft-deletes source.
    expect(mockValues).toHaveBeenCalledWith({ userId: 'u1', wordListItemId: TO, hookText: 'dup note' });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps the survivor note when it is newer (LWW)', async () => {
    setup(
      [{ id: 'h1', userId: 'u1', hookText: 'old dup', updatedAt: new Date('2024-01-01'), deletedAt: null }],
      [{ id: 'h2', userId: 'u1', hookText: 'fresh survivor', updatedAt: new Date('2024-06-01'), deletedAt: null }],
    );

    await mergeHooksToSurvivor(FROM, TO);

    // Survivor newer → no upsert, but the duplicate's hook is still tombstoned.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('overwrites the survivor note when the duplicate is newer (LWW)', async () => {
    setup(
      [{ id: 'h1', userId: 'u1', hookText: 'fresh dup', updatedAt: new Date('2024-06-01'), deletedAt: null }],
      [{ id: 'h2', userId: 'u1', hookText: 'old survivor', updatedAt: new Date('2024-01-01'), deletedAt: null }],
    );

    await mergeHooksToSurvivor(FROM, TO);

    expect(mockValues).toHaveBeenCalledWith({ userId: 'u1', wordListItemId: TO, hookText: 'fresh dup' });
  });

  it('revives a tombstoned survivor hook rather than treating it as live', async () => {
    setup(
      [{ id: 'h1', userId: 'u1', hookText: 'dup note', updatedAt: new Date('2024-01-01'), deletedAt: null }],
      [{ id: 'h2', userId: 'u1', hookText: 'deleted survivor', updatedAt: new Date('2024-09-01'), deletedAt: new Date('2024-09-02') }],
    );

    await mergeHooksToSurvivor(FROM, TO);

    // Survivor's row is tombstoned → not "live", so the duplicate's text wins
    // even though its updatedAt is older.
    expect(mockValues).toHaveBeenCalledWith({ userId: 'u1', wordListItemId: TO, hookText: 'dup note' });
  });

  it('is a no-op when source and survivor are the same item', async () => {
    await mergeHooksToSurvivor(TO, TO);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
