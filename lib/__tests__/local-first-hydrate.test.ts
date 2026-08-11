import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncResponse } from '@/features/sync/types';
import { META_SCHEMA_VERSION } from '../local-first/db';

vi.mock('../local-first/availability', () => ({
  ensureLocalFirstAvailability: vi.fn(),
}));

vi.mock('../local-first/stores', () => ({
  getMeta: vi.fn(),
  getAllProgressRows: vi.fn(),
  getAllMemoryHookRows: vi.fn(),
  getCategoryFilterRow: vi.fn(),
  getPrefsRow: vi.fn(),
  getContentRow: vi.fn(),
  putProgressRow: vi.fn(),
  putMemoryHookRow: vi.fn(),
  putCategoryFilterRow: vi.fn(),
  putPrefsRow: vi.fn(),
  putContentRow: vi.fn(),
  putMeta: vi.fn(),
}));

vi.mock('../local-learning-cache', () => ({
  getSnapshot: vi.fn(),
}));

vi.mock('../local-first/outbox', () => ({
  listOps: vi.fn(),
}));

import { ensureLocalFirstAvailability } from '../local-first/availability';
import {
  getAllMemoryHookRows,
  getAllProgressRows,
  getCategoryFilterRow,
  getMeta,
  getPrefsRow,
  getContentRow,
  putCategoryFilterRow,
  putMemoryHookRow,
  putMeta,
  putPrefsRow,
  putContentRow,
  putProgressRow,
} from '../local-first/stores';
import { getSnapshot } from '../local-learning-cache';
import { listOps } from '../local-first/outbox';
import {
  checkpointAcknowledgedOps,
  applyPendingOutboxToSyncResponse,
  loadAllDomainsFromIdb,
  persistDeltaToIdb,
  persistDomainsToIdb,
} from '../local-first/hydrate';

const mockEnsure = vi.mocked(ensureLocalFirstAvailability);
const mockGetMeta = vi.mocked(getMeta);
const mockGetAllProgressRows = vi.mocked(getAllProgressRows);
const mockGetAllMemoryHookRows = vi.mocked(getAllMemoryHookRows);
const mockGetCategoryFilterRow = vi.mocked(getCategoryFilterRow);
const mockGetPrefsRow = vi.mocked(getPrefsRow);
const mockGetContentRow = vi.mocked(getContentRow);
const mockGetSnapshot = vi.mocked(getSnapshot);
const mockPutProgressRow = vi.mocked(putProgressRow);
const mockPutMemoryHookRow = vi.mocked(putMemoryHookRow);
const mockPutCategoryFilterRow = vi.mocked(putCategoryFilterRow);
const mockPutPrefsRow = vi.mocked(putPrefsRow);
const mockPutContentRow = vi.mocked(putContentRow);
const mockPutMeta = vi.mocked(putMeta);
const mockListOps = vi.mocked(listOps);

beforeEach(() => {
  vi.clearAllMocks();
  mockEnsure.mockResolvedValue(true);
  mockGetMeta.mockResolvedValue({
    schemaVersion: META_SCHEMA_VERSION,
    deviceId: 'dev-1',
    lastSinceCursor: null,
  });
  mockGetAllProgressRows.mockResolvedValue([]);
  mockGetAllMemoryHookRows.mockResolvedValue([]);
  mockGetCategoryFilterRow.mockResolvedValue(null);
  mockGetPrefsRow.mockResolvedValue(null);
  mockGetContentRow.mockResolvedValue(null);
  mockGetSnapshot.mockResolvedValue(null);
  mockPutProgressRow.mockResolvedValue(true);
  mockPutMemoryHookRow.mockResolvedValue(true);
  mockPutCategoryFilterRow.mockResolvedValue(true);
  mockPutPrefsRow.mockResolvedValue(true);
  mockPutContentRow.mockResolvedValue(true);
  mockPutMeta.mockResolvedValue(true);
  mockListOps.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadAllDomainsFromIdb', () => {
  it('returns null when local-first is unavailable', async () => {
    mockEnsure.mockResolvedValueOnce(false);
    const result = await loadAllDomainsFromIdb();
    expect(result).toBeNull();
  });

  it('returns null when meta schema version mismatches', async () => {
    mockGetMeta.mockResolvedValueOnce({
      schemaVersion: META_SCHEMA_VERSION - 1,
      deviceId: null,
      lastSinceCursor: null,
    });
    const result = await loadAllDomainsFromIdb();
    expect(result).toBeNull();
  });

  it('returns null when there is no user record anywhere', async () => {
    mockGetAllProgressRows.mockResolvedValueOnce([
      {
        key: 'w-1',
        row: {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: '2026-05-01T00:00:00Z',
          value: { wordId: 'w-1', stageIndex: 1 },
        },
      },
    ]);
    const result = await loadAllDomainsFromIdb();
    expect(result).toBeNull();
  });

  it('hydrates from per-domain rows', async () => {
    const user = { id: 'u-1', role: 'knownLanguage' } as SyncResponse['user'];
    mockGetPrefsRow.mockResolvedValueOnce({
      schemaVersion: META_SCHEMA_VERSION,
      updatedAt: '2026-05-01T00:00:00Z',
      value: user,
    });
    mockGetAllProgressRows.mockResolvedValueOnce([
      {
        key: 'w-1',
        row: {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: '2026-05-01T00:00:00Z',
          value: { wordId: 'w-1', stageIndex: 3 },
        },
      },
      {
        key: 'w-2',
        row: {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: '2026-05-02T00:00:00Z',
          deletedAt: '2026-05-03T00:00:00Z',
          value: { wordId: 'w-2', stageIndex: 7 },
        },
      },
    ]);
    mockGetAllMemoryHookRows.mockResolvedValueOnce([
      {
        key: 'w-1',
        row: {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: '2026-05-01T00:00:00Z',
          value: 'mnemonic',
        },
      },
    ]);
    mockGetCategoryFilterRow.mockResolvedValueOnce({
      schemaVersion: META_SCHEMA_VERSION,
      updatedAt: '2026-05-01T00:00:00Z',
      value: ['food', 'verbs'],
    });

    const result = await loadAllDomainsFromIdb();
    expect(result).not.toBeNull();
    expect(result!.syncResponse.success).toBe(true);
    expect(result!.syncResponse.user).toEqual(user);
    expect(Object.keys(result!.syncResponse.progress)).toEqual(['w-1']);
    expect(result!.syncResponse.memory_hooks).toEqual({ 'w-1': 'mnemonic' });
    expect(result!.syncResponse.category_filters).toEqual(['food', 'verbs']);
    expect(result!.activeListId).toBeNull();
  });

  it('falls back to snapshot fields when per-domain rows are empty', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      savedAt: 1,
      activeListId: 'list-9',
      data: {
        user: { id: 'u-2', role: 'languageToLearn' } as SyncResponse['user'],
        progress: { 'w-9': { wordId: 'w-9', stageIndex: 4 } } as unknown as SyncResponse['progress'],
        memory_hooks: { 'w-9': 'note' },
        category_filters: ['animals'],
        word_list_items: [{ id: 'wli-1' }] as unknown as SyncResponse['word_list_items'],
        categories: { 'cat-1': { name: 'Animals', position: 0 } },
        lists: [],
        sync_revision: 42,
      },
    });

    const result = await loadAllDomainsFromIdb();
    expect(result).not.toBeNull();
    expect(result!.syncResponse.user).toEqual({ id: 'u-2', role: 'languageToLearn' });
    expect(result!.syncResponse.progress['w-9']).toEqual({ wordId: 'w-9', stageIndex: 4 });
    expect(result!.syncResponse.memory_hooks).toEqual({ 'w-9': 'note' });
    expect(result!.syncResponse.category_filters).toEqual(['animals']);
    expect(result!.syncResponse.sync_revision).toBe(42);
    expect(result!.activeListId).toBe('list-9');
  });
});

describe('persistDomainsToIdb', () => {
  it('writes per-domain rows from a SyncResponse', async () => {
    const data: SyncResponse = {
      success: true,
      user: { id: 'u-1', role: 'knownLanguage' } as SyncResponse['user'],
      progress: {
        'w-1': { updatedAt: '2026-05-01T00:00:00Z', wordId: 'w-1', stageIndex: 2 } as unknown as SyncResponse['progress'][string],
      },
      memory_hooks: { 'w-1': 'hook' },
      category_filters: ['food'],
    };

    await expect(persistDomainsToIdb(data)).resolves.toBe(true);

    expect(mockPutProgressRow).toHaveBeenCalledWith('w-1', data.progress['w-1'], {
      updatedAt: '2026-05-01T00:00:00Z',
    });
    expect(mockPutMemoryHookRow).toHaveBeenCalledWith('w-1', 'hook');
    expect(mockPutCategoryFilterRow).toHaveBeenCalledWith('all', ['food']);
    expect(mockPutPrefsRow).toHaveBeenCalledWith('user', data.user);
    expect(mockPutMeta).not.toHaveBeenCalled();
  });

  it('does nothing when local-first is unavailable', async () => {
    mockEnsure.mockResolvedValueOnce(false);
    await expect(persistDomainsToIdb({
      success: true,
      user: { id: 'u-1', role: 'knownLanguage' } as SyncResponse['user'],
      progress: {},
      memory_hooks: {},
      category_filters: [],
    })).resolves.toBe(false);
    expect(mockPutProgressRow).not.toHaveBeenCalled();
    expect(mockPutMeta).not.toHaveBeenCalled();
  });

  it('tombstones memory hooks missing from an authoritative full snapshot', async () => {
    mockGetAllMemoryHookRows.mockResolvedValueOnce([
      {
        key: 'removed-hook',
        row: {
          schemaVersion: META_SCHEMA_VERSION,
          updatedAt: '2026-05-01T00:00:00Z',
          value: 'stale text',
        },
      },
    ]);

    await expect(persistDomainsToIdb({
      success: true,
      user: { id: 'u-1' } as SyncResponse['user'],
      progress: {},
      memory_hooks: {},
      category_filters: [],
    })).resolves.toBe(true);

    expect(mockPutMemoryHookRow).toHaveBeenCalledWith(
      'removed-hook',
      '',
      expect.objectContaining({ deletedAt: expect.any(String) }),
    );
  });
});

describe('checkpointAcknowledgedOps', () => {
  it('projects an acked operation into domain stores without consulting the remaining outbox', async () => {
    const user = { id: 'u-1', settings_language_revision: 4 } as SyncResponse['user'];
    mockGetPrefsRow.mockResolvedValueOnce({
      schemaVersion: META_SCHEMA_VERSION,
      updatedAt: '2026-08-10T00:00:00.000Z',
      value: user,
    });

    const result = await checkpointAcknowledgedOps({
      success: true,
      is_delta: true,
      user: { ...user, settings_language_revision: 5 },
    } as SyncResponse, [{
      clientOpId: 'progress-1',
      batchId: 'batch-1',
      clientCreatedAt: '2026-08-10T00:00:01.000Z',
      deviceId: 'device-1',
      attempts: 0,
      status: 'pending',
      entity: 'progress',
      opType: 'upsert',
      payload: {
        word_id: 'word-1',
        stage_index: 3,
        known_count: 2,
        unknown_count: 1,
        last_known_at: null,
        last_unknown_at: null,
        next_due_at: null,
      },
    }]);

    expect(result?.progress['word-1']).toMatchObject({ stageIndex: 3, knownCount: 2 });
    expect(mockPutProgressRow).toHaveBeenCalledWith(
      'word-1',
      expect.objectContaining({ stageIndex: 3, knownCount: 2 }),
      expect.any(Object),
    );
    expect(mockPutPrefsRow).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ settings_language_revision: 5 }),
    );
    expect(mockListOps).not.toHaveBeenCalled();
  });
});

describe('persistDeltaToIdb', () => {
  it('persists changed rows and tombstones before advancing the cursor', async () => {
    const delta: SyncResponse = {
      success: true,
      is_delta: true,
      sync_revision: 1779500000000,
      user: { id: 'u-1', role: 'knownLanguage' } as SyncResponse['user'],
      progress: {
        'w-1': {
          updatedAt: '2026-05-01T00:00:00Z',
          wordId: 'w-1',
          stageIndex: 3,
        } as unknown as SyncResponse['progress'][string],
      },
      memory_hooks: { 'w-1': 'fresh hook' },
      memory_hooks_deleted: ['w-2'],
      category_filters: ['food'],
    };

    await expect(persistDeltaToIdb(delta)).resolves.toBe(true);

    expect(mockPutProgressRow).toHaveBeenCalledWith('w-1', delta.progress['w-1'], {
      updatedAt: '2026-05-01T00:00:00Z',
    });
    expect(mockPutMemoryHookRow).toHaveBeenCalledWith('w-1', 'fresh hook');
    expect(mockPutMemoryHookRow).toHaveBeenCalledWith(
      'w-2',
      '',
      expect.objectContaining({ deletedAt: expect.any(String) }),
    );
    expect(mockPutMeta).toHaveBeenCalledWith({
      schemaVersion: META_SCHEMA_VERSION,
      lastSinceCursor: '1779500000000',
    });
    expect(mockPutMeta.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockPutMemoryHookRow.mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it('does not advance the cursor when a delta row fails to persist', async () => {
    mockPutMemoryHookRow.mockResolvedValueOnce(false);

    await expect(persistDeltaToIdb({
      success: true,
      is_delta: true,
      sync_revision: 1779500000000,
      user: { id: 'u-1' } as SyncResponse['user'],
      progress: {},
      memory_hooks: { 'w-1': 'fresh hook' },
      category_filters: [],
    })).resolves.toBe(false);

    expect(mockPutMeta).not.toHaveBeenCalled();
  });
});

describe('applyPendingOutboxToSyncResponse', () => {
  it('replays pending settings-language and progress writes over a stale server snapshot', async () => {
    const serverData: SyncResponse = {
      success: true,
      user: {
        id: 'u-1',
        role: 'languageToLearn',
        settings_language: 'en',
        settings_language_selected_at: '2026-05-01T00:00:00.000Z',
      } as SyncResponse['user'],
      progress: {
        'w-1': {
          id: 'row-1',
          userId: 'u-1',
          wordId: 'w-1',
          wordListItemId: null,
          stageIndex: 2,
          knownCount: 0,
          unknownCount: 0,
          lastKnownAt: null,
          lastUnknownAt: null,
          nextDueAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([
      {
        clientOpId: 'pref-1',
        entity: 'preference',
        opType: 'set',
        payload: { field: 'settings_language', value: 'de' },
        clientCreatedAt: '2026-05-24T12:00:00.000Z',
        deviceId: 'dev-1',
        attempts: 0,
      },
      {
        clientOpId: 'progress-1',
        entity: 'progress',
        opType: 'upsert',
        payload: {
          word_id: 'w-1',
          stage_index: 7,
          known_count: 3,
          unknown_count: 1,
          last_known_at: 1_779_625_000_000,
          last_unknown_at: null,
          next_due_at: null,
          client_updated_at: 1_779_625_000_000,
        },
        clientCreatedAt: '2026-05-24T12:00:01.000Z',
        deviceId: 'dev-1',
        attempts: 0,
      },
    ]);

    const result = await applyPendingOutboxToSyncResponse(serverData);

    expect(result.user.settings_language).toBe('de');
    expect(result.user.settings_language_selected_at).toBe('2026-05-24T12:00:00.000Z');
    expect(result.progress['w-1'].stageIndex).toBe(7);
    expect(result.progress['w-1'].knownCount).toBe(3);
    expect(serverData.user.settings_language).toBe('en');
    expect(serverData.progress['w-1'].stageIndex).toBe(2);
  });

  it('overlays one pending atomic language-pair write on a stale snapshot', async () => {
    const serverData: SyncResponse = {
      success: true,
      user: {
        id: 'u-1',
        language_from: 'fr',
        language_to: 'es',
        onboarding_completed_at: '2026-05-01T00:00:00.000Z',
      } as SyncResponse['user'],
      progress: {},
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([
      {
        clientOpId: 'pair-1',
        entity: 'preference',
        opType: 'set_language_pair',
        payload: {
          values: {
            language_from: 'cs',
            language_to: 'vi',
            onboarding_completed: true,
          },
        },
        clientCreatedAt: '2026-05-24T12:00:00.000Z',
        deviceId: 'dev-1',
        attempts: 0,
      },
    ]);

    const result = await applyPendingOutboxToSyncResponse(serverData);

    expect(result.user.language_from).toBe('cs');
    expect(result.user.language_to).toBe('vi');
    expect(result.user.onboarding_completed_at).toBe('2026-05-24T12:00:00.000Z');
  });

  it('replays a submitted review event when the server snapshot is still stale', async () => {
    const serverData: SyncResponse = {
      success: true,
      user: { id: 'u-1', role: 'languageToLearn' } as SyncResponse['user'],
      progress: {
        'w-1': {
          id: 'row-1',
          userId: 'u-1',
          wordId: 'w-1',
          wordListItemId: null,
          stageIndex: 1,
          knownCount: 0,
          unknownCount: 0,
          lastKnownAt: null,
          lastUnknownAt: null,
          nextDueAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([
      {
        clientOpId: 'review-1',
        entity: 'review_event',
        opType: 'event',
        payload: {
          client_event_id: 'review-1',
          word_id: 'w-1',
          action: 'known',
          client_created_at: 1_779_625_000_000,
        },
        clientCreatedAt: '2026-05-24T12:00:00.000Z',
        deviceId: 'dev-1',
        attempts: 0,
      },
    ]);

    const result = await applyPendingOutboxToSyncResponse(serverData);

    expect(result.progress['w-1'].stageIndex).toBe(2);
    expect(result.progress['w-1'].knownCount).toBe(1);
    expect(result.progress['w-1'].lastKnownAt).toBe('2026-05-24T12:16:40.000Z');
  });

  it('does not double-replay a review event already reflected by the server snapshot', async () => {
    const clientCreatedAt = 1_779_625_000_000;
    const serverData: SyncResponse = {
      success: true,
      user: { id: 'u-1', role: 'languageToLearn' } as SyncResponse['user'],
      progress: {
        'w-1': {
          id: 'row-1',
          userId: 'u-1',
          wordId: 'w-1',
          wordListItemId: null,
          stageIndex: 2,
          knownCount: 1,
          unknownCount: 0,
          lastKnownAt: new Date(clientCreatedAt).toISOString(),
          lastUnknownAt: null,
          nextDueAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: new Date(clientCreatedAt).toISOString(),
        },
      },
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([]);

    const result = await applyPendingOutboxToSyncResponse(serverData, [
      {
        client_event_id: 'review-1',
        word_id: 'w-1',
        action: 'known',
        client_created_at: clientCreatedAt,
      },
    ]);

    expect(result.progress['w-1'].stageIndex).toBe(2);
    expect(result.progress['w-1'].knownCount).toBe(1);
  });

  it('does not replay an older review event over a newer pending custom progress write', async () => {
    const reviewAt = 1_779_625_000_000;
    const customAt = reviewAt + 1_000;
    const serverData: SyncResponse = {
      success: true,
      user: { id: 'u-1', role: 'languageToLearn' } as SyncResponse['user'],
      progress: {
        'w-1': {
          id: 'row-1',
          userId: 'u-1',
          wordId: 'w-1',
          wordListItemId: null,
          stageIndex: 0,
          knownCount: 0,
          unknownCount: 0,
          lastKnownAt: null,
          lastUnknownAt: null,
          nextDueAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      },
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([
      {
        clientOpId: 'review-1',
        entity: 'review_event',
        opType: 'event',
        payload: {
          client_event_id: 'review-1',
          word_id: 'w-1',
          action: 'known',
          client_created_at: reviewAt,
        },
        clientCreatedAt: new Date(reviewAt).toISOString(),
        deviceId: 'dev-1',
        attempts: 0,
      },
      {
        clientOpId: 'progress-1',
        entity: 'progress',
        opType: 'upsert',
        payload: {
          word_id: 'w-1',
          stage_index: 1,
          known_count: 1,
          unknown_count: 0,
          last_known_at: customAt,
          last_unknown_at: null,
          next_due_at: customAt + 5 * 60 * 1000,
          client_updated_at: customAt,
        },
        clientCreatedAt: new Date(customAt).toISOString(),
        deviceId: 'dev-1',
        attempts: 0,
      },
    ]);

    const result = await applyPendingOutboxToSyncResponse(serverData);

    expect(result.progress['w-1'].stageIndex).toBe(1);
    expect(result.progress['w-1'].knownCount).toBe(1);
    expect(result.progress['w-1'].nextDueAt).toBe(new Date(customAt + 5 * 60 * 1000).toISOString());
  });

  it('does not fold a submitted review event from a stage-0 baseline when the response omits the row', async () => {
    // The ack-only POST response carries no `progress` (is_delta: true), so a
    // just-swiped word whose real stage is 3 has no row here. Folding the echoed
    // `known` event from an assumed stage 0 would land it on stage 1 = 5 min and
    // then overwrite the correct value via the delta merge — the reported bug.
    const clientCreatedAt = 1_779_625_000_000;
    const ackResponse: SyncResponse = {
      success: true,
      is_delta: true,
      user: { id: 'u-1', role: 'languageToLearn' } as SyncResponse['user'],
      progress: {},
      memory_hooks: {},
      category_filters: [],
    };
    mockListOps.mockResolvedValueOnce([]);

    const result = await applyPendingOutboxToSyncResponse(ackResponse, [
      {
        client_event_id: 'review-1',
        word_list_item_id: 'item-1',
        action: 'known',
        client_created_at: clientCreatedAt,
      },
    ]);

    // The word must be left untouched (no invented stage-1 row); the locally
    // held optimistic state already reflects the review.
    expect(result.progress['item-1']).toBeUndefined();
  });
});
