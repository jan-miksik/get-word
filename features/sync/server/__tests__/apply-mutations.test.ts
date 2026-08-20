import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordActivitySegmentsIfNew = vi.fn(async () => [] as string[]);
const recordAppliedSyncClientOpIds = vi.fn(async () => undefined);
const getAppliedSyncClientOpIds = vi.fn(async () => new Set<string>());
const updateUserPreferences = vi.fn(async () => undefined);

vi.mock('@/lib/db', () => ({
  applyNewReviewEvents: vi.fn(async () => []),
  batchUpsertProgress: vi.fn(async () => undefined),
  batchUpsertProgressByContentKey: vi.fn(async () => undefined),
  deleteMemoryHook: vi.fn(async () => undefined),
  deleteMemoryHookByItemId: vi.fn(async () => undefined),
  getContentKeysForItemIds: vi.fn(async () => new Map<string, string>()),
  getAppliedSyncClientOpIds: (...args: unknown[]) => getAppliedSyncClientOpIds(...(args as [])),
  recordActivitySegmentsIfNew: (...args: unknown[]) =>
    recordActivitySegmentsIfNew(...(args as [])),
  recordAppliedSyncClientOpIds: (...args: unknown[]) =>
    recordAppliedSyncClientOpIds(...(args as [])),
  setUserCategoryFilters: vi.fn(async () => undefined),
  updateUserPreferences: (...args: unknown[]) => updateUserPreferences(...(args as [])),
  upsertMemoryHook: vi.fn(async () => undefined),
  upsertMemoryHookByItemId: vi.fn(async () => undefined),
}));

import { applySyncMutations } from '../apply-mutations';
import type { SyncRequest } from '@/features/sync/types';
import type { User } from '@/lib/db/schema';
import { presetConfig } from '@/features/learning/fine-tune/config';

const user = { id: 'user-1', gameScore: 0, userRole: 'user' } as unknown as User;

function request(): SyncRequest {
  return {
    deviceId: 'device-1',
    show_english: true,
    activity_segments: [
      {
        client_segment_id: 'seg-1',
        session_id: 'session-1',
        surface: 'study',
        started_at: Date.now() - 60_000,
        ended_at: Date.now(),
        active_ms: 60_000,
      },
    ],
    client_op_ids: ['seg-1', 'pref-1'],
  } as unknown as SyncRequest;
}

beforeEach(() => {
  recordActivitySegmentsIfNew.mockReset().mockResolvedValue([]);
  recordAppliedSyncClientOpIds.mockReset().mockResolvedValue(undefined);
  getAppliedSyncClientOpIds.mockReset().mockResolvedValue(new Set<string>());
  updateUserPreferences.mockReset().mockResolvedValue(undefined);
});

describe('activity segments in a mixed batch', () => {
  it('acknowledges every op when the write succeeds', async () => {
    const result = await applySyncMutations({ user, request: request() });

    expect(result.clientOpIds).toEqual(['seg-1', 'pref-1']);
    expect(result.opResults).toEqual([
      { clientOpId: 'seg-1', status: 'applied' },
      { clientOpId: 'pref-1', status: 'applied' },
    ]);
  });

  it('does not acknowledge segments the database refused', async () => {
    // The realistic failure: a deploy that reached production before migration
    // 0061 was applied by hand.
    recordActivitySegmentsIfNew.mockRejectedValue(
      new Error('relation "activity_segments" does not exist'),
    );

    const result = await applySyncMutations({ user, request: request() });

    // Measurement must not cost the user the preference write beside it...
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    expect(result.opResults).toEqual([
      { clientOpId: 'seg-1', status: 'retry' },
      { clientOpId: 'pref-1', status: 'applied' },
    ]);
    // ...but an acknowledged op is deleted from the client's outbox, so the
    // segment must be left out of both the ack hint and the applied ledger.
    expect(result.clientOpIds).toEqual(['pref-1']);
    expect(recordAppliedSyncClientOpIds).toHaveBeenCalledWith('user-1', ['pref-1']);
  });
});

describe('learning fine tune', () => {
  it('passes the config through to the preference write', async () => {
    const config = presetConfig('demanding');
    await applySyncMutations({
      user,
      request: {
        deviceId: 'device-1',
        learning_fine_tune: config,
        client_op_ids: ['pref-1'],
      } as unknown as SyncRequest,
    });

    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    const prefs = (updateUserPreferences.mock.calls[0] as unknown as unknown[])[1] as {
      learning_fine_tune?: unknown;
    };
    expect(prefs.learning_fine_tune).toEqual(config);
  });

  it('leaves the stored config alone when the request does not mention it', async () => {
    await applySyncMutations({
      user,
      request: {
        deviceId: 'device-1',
        show_english: true,
        client_op_ids: ['pref-1'],
      } as unknown as SyncRequest,
    });

    const prefs = (updateUserPreferences.mock.calls[0] as unknown as unknown[])[1] as {
      learning_fine_tune?: unknown;
    };
    expect(prefs.learning_fine_tune).toBeUndefined();
  });
});
