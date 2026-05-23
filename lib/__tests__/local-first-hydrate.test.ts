import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncResponse } from '@/lib/sync';
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
  putProgressRow: vi.fn(),
  putMemoryHookRow: vi.fn(),
  putCategoryFilterRow: vi.fn(),
  putPrefsRow: vi.fn(),
  putMeta: vi.fn(),
}));

vi.mock('../local-learning-cache', () => ({
  getSnapshot: vi.fn(),
}));

import { ensureLocalFirstAvailability } from '../local-first/availability';
import {
  getAllMemoryHookRows,
  getAllProgressRows,
  getCategoryFilterRow,
  getMeta,
  getPrefsRow,
  putCategoryFilterRow,
  putMemoryHookRow,
  putMeta,
  putPrefsRow,
  putProgressRow,
} from '../local-first/stores';
import { getSnapshot } from '../local-learning-cache';
import { loadAllDomainsFromIdb, persistDomainsToIdb } from '../local-first/hydrate';

const mockEnsure = vi.mocked(ensureLocalFirstAvailability);
const mockGetMeta = vi.mocked(getMeta);
const mockGetAllProgressRows = vi.mocked(getAllProgressRows);
const mockGetAllMemoryHookRows = vi.mocked(getAllMemoryHookRows);
const mockGetCategoryFilterRow = vi.mocked(getCategoryFilterRow);
const mockGetPrefsRow = vi.mocked(getPrefsRow);
const mockGetSnapshot = vi.mocked(getSnapshot);
const mockPutProgressRow = vi.mocked(putProgressRow);
const mockPutMemoryHookRow = vi.mocked(putMemoryHookRow);
const mockPutCategoryFilterRow = vi.mocked(putCategoryFilterRow);
const mockPutPrefsRow = vi.mocked(putPrefsRow);
const mockPutMeta = vi.mocked(putMeta);

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
  mockGetSnapshot.mockResolvedValue(null);
  mockPutProgressRow.mockResolvedValue(true);
  mockPutMemoryHookRow.mockResolvedValue(true);
  mockPutCategoryFilterRow.mockResolvedValue(true);
  mockPutPrefsRow.mockResolvedValue(true);
  mockPutMeta.mockResolvedValue(true);
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

    await persistDomainsToIdb(data);

    expect(mockPutProgressRow).toHaveBeenCalledWith('w-1', data.progress['w-1'], {
      updatedAt: '2026-05-01T00:00:00Z',
    });
    expect(mockPutMemoryHookRow).toHaveBeenCalledWith('w-1', 'hook');
    expect(mockPutCategoryFilterRow).toHaveBeenCalledWith('all', ['food']);
    expect(mockPutPrefsRow).toHaveBeenCalledWith('user', data.user);
    expect(mockPutMeta).toHaveBeenCalledWith({ schemaVersion: META_SCHEMA_VERSION });
  });

  it('does nothing when local-first is unavailable', async () => {
    mockEnsure.mockResolvedValueOnce(false);
    await persistDomainsToIdb({
      success: true,
      user: { id: 'u-1', role: 'knownLanguage' } as SyncResponse['user'],
      progress: {},
      memory_hooks: {},
      category_filters: [],
    });
    expect(mockPutProgressRow).not.toHaveBeenCalled();
    expect(mockPutMeta).not.toHaveBeenCalled();
  });
});
