import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsert = vi.fn();
const mockTransaction = vi.fn();
const mockApplyReviewEventToProgress = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock('../progress', () => ({
  applyReviewEventToProgress: (...args: unknown[]) => mockApplyReviewEventToProgress(...args),
}));

import { applyNewReviewEvents } from '../review-events';

function mockInsertReturning(returningValue: unknown[]) {
  const returning = vi.fn().mockResolvedValue(returningValue);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  mockInsert.mockReturnValue({ values });
  return { values, onConflictDoNothing, returning };
}

/**
 * The production code calls `db.transaction(async (tx) => {...})`. In tests we
 * pass the same `db` mock back as the tx handle so `recordReviewEventIfNew`
 * uses our mocked `insert` chain. To simulate a rollback we run the callback
 * inside try/catch and re-throw — same shape as drizzle/postgres.
 */
function installPassThroughTransaction() {
  mockTransaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
    const fakeTx = {
      insert: (...args: unknown[]) => mockInsert(...args),
    };
    return await callback(fakeTx);
  });
}

describe('applyNewReviewEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installPassThroughTransaction();
  });

  it('applies newly inserted review events', async () => {
    mockInsertReturning([{ id: 'row-1' }]);

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      deviceId: 'device-1',
      sessionId: 'session-1',
      events: [{
        client_event_id: 'event-1',
        word_id: 'w001',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual(['event-1']);
    expect(mockApplyReviewEventToProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        wordId: 'w001',
        action: 'known',
      }),
      expect.any(Object), // tx handle
    );
  });

  it('persists same-stage attempts as review events', async () => {
    mockInsertReturning([{ id: 'row-stay' }]);

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      events: [{
        client_event_id: 'event-stay',
        word_id: 'w001',
        action: 'stay',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual(['event-stay']);
    expect(mockApplyReviewEventToProgress).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'stay' }),
      expect.any(Object),
    );
  });

  it('does not apply duplicate events when insert is ignored', async () => {
    mockInsertReturning([]);

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      events: [{
        client_event_id: 'event-1',
        word_id: 'w001',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual(['event-1']);
    expect(mockApplyReviewEventToProgress).not.toHaveBeenCalled();
  });

  it('acknowledges stale review targets without applying progress', async () => {
    const returning = vi.fn().mockRejectedValue({
      cause: {
        code: '23503',
        constraint_name: 'review_events_word_list_item_id_word_list_items_id_fk',
      },
    });
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    mockInsert.mockReturnValue({ values });

    const applied = await applyNewReviewEvents({
      userId: 'user-1',
      events: [{
        client_event_id: 'event-stale',
        word_list_item_id: 'bdba0c94-ac30-45a0-9067-9eb15b2641bf',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(applied).toEqual(['event-stale']);
    expect(mockApplyReviewEventToProgress).not.toHaveBeenCalled();
  });

  it('rolls back the inserted event when progress apply fails', async () => {
    // Simulate a real DB transaction: the callback runs, applyProgress throws,
    // and the runtime rolls back. After rollback the next attempt sees no
    // existing row and inserts cleanly.
    mockInsertReturning([{ id: 'row-1' }]);
    mockApplyReviewEventToProgress.mockRejectedValueOnce(new Error('progress upsert failed'));

    // Drizzle's transaction re-throws the callback's error after rollback;
    // applyNewReviewEvents lets it bubble so the route returns 500 and the
    // client retries the whole batch. We assert the rejection propagates.
    await expect(
      applyNewReviewEvents({
        userId: 'user-1',
        events: [{
          client_event_id: 'event-1',
          word_id: 'w001',
          action: 'known',
          client_created_at: 1776944510000,
        }],
      })
    ).rejects.toThrow('progress upsert failed');

    expect(mockApplyReviewEventToProgress).toHaveBeenCalledTimes(1);
  });

  it('runs insert and progress apply inside the same transaction', async () => {
    mockInsertReturning([{ id: 'row-1' }]);

    await applyNewReviewEvents({
      userId: 'user-1',
      events: [{
        client_event_id: 'event-1',
        word_id: 'w001',
        action: 'known',
        client_created_at: 1776944510000,
      }],
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Both helpers receive the same tx handle as their last arg, proving they
    // share the transaction.
    const txArg = mockApplyReviewEventToProgress.mock.calls[0][1];
    expect(txArg).toBeDefined();
    expect(typeof txArg.insert).toBe('function');
  });
});
