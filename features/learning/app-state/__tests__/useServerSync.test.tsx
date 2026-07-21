import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { SyncResponse } from '@/features/sync/types';

const mockFetchUserData = vi.fn<(options?: { since?: number | string; contentRev?: string }) => Promise<SyncResponse>>();
const mockApplyPendingOutboxToSyncResponse = vi.fn(async (data: SyncResponse) => data);
const mockLoadAllDomainsFromIdb = vi.fn<() => Promise<{ syncResponse: SyncResponse; activeListId: string | null } | null>>();
const mockPersistDomainsToIdb = vi.fn<() => Promise<boolean>>(async () => true);
const mockPersistDeltaToIdb = vi.fn<(_data: SyncResponse) => Promise<boolean>>(async () => true);
const mockGetStoragePreference = vi.fn(() => false);
const mockGetSnapshot = vi.fn(async () => null);
const mockSaveSnapshot = vi.fn(async () => true);
const mockGetMeta = vi.fn(async () => null as {
  lastSinceCursor?: string | null;
  lastContentRevision?: string | null;
} | null);
const mockPutMeta = vi.fn<(_patch: unknown) => Promise<boolean>>(async () => true);

vi.mock('@/lib/sync', () => ({
  fetchUserData: (options?: { since?: number | string; contentRev?: string }) => mockFetchUserData(options),
  linkWalletWithRetry: vi.fn(),
  clearPendingSync: vi.fn(),
  isAuthRequiredError: vi.fn(() => false),
  markServerSnapshotApplied: vi.fn(),
}));

vi.mock('@/lib/sync-coordinator', () => ({
  installSyncLifecycle: vi.fn(() => () => undefined),
}));

vi.mock('@/lib/local-first/drainer', () => ({
  startDrainer: vi.fn(() => ({ stop: vi.fn() })),
}));

vi.mock('@/lib/local-first/hydrate', () => ({
  applyPendingOutboxToSyncResponse: (data: SyncResponse) =>
    mockApplyPendingOutboxToSyncResponse(data),
  loadAllDomainsFromIdb: () => mockLoadAllDomainsFromIdb(),
  persistDomainsToIdb: () => mockPersistDomainsToIdb(),
  persistDeltaToIdb: (data: SyncResponse) => mockPersistDeltaToIdb(data),
}));

vi.mock('@/lib/local-first/stores', () => ({
  getMeta: () => mockGetMeta(),
  putMeta: (patch: unknown) => mockPutMeta(patch),
}));

vi.mock('@/lib/local-learning-cache', () => ({
  getSnapshot: () => mockGetSnapshot(),
  getStoragePreference: () => mockGetStoragePreference(),
  saveSnapshot: () => mockSaveSnapshot(),
}));

import { useServerSync, WARM_START_SYNC_GRACE_MS } from '../useServerSync';

const syncResponse = {
  success: true,
  user: {
    id: 'user-1',
    settings_language: 'en',
    language_from: 'en',
    language_to: 'cs',
    onboarding_completed_at: '2026-05-01T00:00:00.000Z',
  },
  progress: {},
  memory_hooks: {},
  category_filters: [],
  lists: [],
} as SyncResponse;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function useServerSyncHarness() {
  const [isHydrated, setIsHydrated] = useState(false);
  const result = useServerSync({
    words: [],
    isHydrated,
    setIsHydrated,
    isUpdatingFromServerRef: { current: false },
    applyServerProgress: vi.fn(),
    mergeServerProgress: vi.fn(),
    applyServerMemoryHooks: vi.fn(),
    mergeServerMemoryHooks: vi.fn(),
    applyServerCategories: vi.fn(),
    applyServerProfile: vi.fn(),
    applyServerPreferences: vi.fn(),
    applyServerGameScore: vi.fn(),
    setSyncedWords: vi.fn(),
    setSubscribedLists: vi.fn(),
    setActiveListId: vi.fn(),
  });

  return { isHydrated, ...result };
}

describe('useServerSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoragePreference.mockReturnValue(false);
    mockGetSnapshot.mockResolvedValue(null);
    mockGetMeta.mockResolvedValue(null);
    mockLoadAllDomainsFromIdb.mockResolvedValue(null);
    mockFetchUserData.mockResolvedValue(syncResponse);
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
  });

  it('keeps the initial server sync pending after local cache hydration until the server fetch settles', async () => {
    mockGetStoragePreference.mockReturnValue(true);
    mockLoadAllDomainsFromIdb.mockResolvedValueOnce({
      syncResponse: {
        ...syncResponse,
        user: {
          ...syncResponse.user,
          language_from: null,
          language_to: null,
          onboarding_completed_at: null,
        },
      },
      activeListId: null,
    });
    const serverFetch = deferred<SyncResponse>();
    mockFetchUserData.mockReturnValueOnce(serverFetch.promise);

    const { result } = renderHook(() => useServerSyncHarness());

    await waitFor(() => expect(result.current.isHydrated).toBe(true));
    expect(result.current.isInitialServerSyncPending).toBe(true);

    serverFetch.resolve(syncResponse);

    await waitFor(() => expect(result.current.isInitialServerSyncPending).toBe(false));
  });

  it('stops waiting on a stalled server fetch once the warm cache has hydrated', async () => {
    mockGetStoragePreference.mockReturnValue(true);
    mockLoadAllDomainsFromIdb.mockResolvedValueOnce({ syncResponse, activeListId: null });
    // Never settles: the connection is up but the response never arrives, which
    // is what a captive portal or a dropped NAT mapping looks like.
    mockFetchUserData.mockReturnValueOnce(deferred<SyncResponse>().promise);

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useServerSyncHarness());

      // Drain the cache read without letting the grace period elapse.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.isHydrated).toBe(true);
      expect(result.current.isInitialServerSyncPending).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(WARM_START_SYNC_GRACE_MS + 1);
      });
      expect(result.current.isInitialServerSyncPending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('durably persists a boot delta before considering the server sync complete', async () => {
    mockGetStoragePreference.mockReturnValue(true);
    mockGetMeta.mockResolvedValue({
      lastSinceCursor: '1779400000000',
      lastContentRevision: 'v2:content-rev-1',
    });
    mockLoadAllDomainsFromIdb.mockResolvedValueOnce({
      syncResponse,
      activeListId: null,
    });
    const delta: SyncResponse = {
      ...syncResponse,
      is_delta: true,
      sync_revision: 1779500000001,
      progress: {
        'word-a': { wordId: 'word-a', stageIndex: 4 } as unknown as SyncResponse['progress'][string],
      },
      memory_hooks: {},
      memory_hooks_deleted: ['word-b'],
    };
    mockFetchUserData.mockResolvedValueOnce(delta);
    const persistence = deferred<boolean>();
    mockPersistDeltaToIdb.mockReturnValueOnce(persistence.promise);

    const { result } = renderHook(() => useServerSyncHarness());

    await waitFor(() => expect(mockPersistDeltaToIdb).toHaveBeenCalledWith(delta));
    expect(mockFetchUserData).toHaveBeenCalledWith({
      since: '1779400000000',
      contentRev: 'v2:content-rev-1',
    });
    expect(result.current.isInitialServerSyncPending).toBe(true);

    persistence.resolve(true);
    await waitFor(() => expect(result.current.isInitialServerSyncPending).toBe(false));
  });

  it('stores full-snapshot cursors only after the snapshot and domains are durable', async () => {
    mockGetStoragePreference.mockReturnValue(true);
    const fullResponse: SyncResponse = {
      ...syncResponse,
      sync_revision: 1779600000000,
      content_revision: 'v2:content-rev-2',
    };
    mockFetchUserData.mockResolvedValueOnce(fullResponse);
    const snapshotPersistence = deferred<boolean>();
    mockSaveSnapshot.mockReturnValueOnce(snapshotPersistence.promise);

    const { result } = renderHook(() => useServerSyncHarness());

    await waitFor(() => expect(mockSaveSnapshot).toHaveBeenCalled());
    expect(mockPutMeta).not.toHaveBeenCalled();
    expect(result.current.isInitialServerSyncPending).toBe(true);

    snapshotPersistence.resolve(true);
    await waitFor(() => expect(mockPutMeta).toHaveBeenCalledWith({
      lastSinceCursor: '1779600000000',
      lastContentRevision: 'v2:content-rev-2',
    }));
    await waitFor(() => expect(result.current.isInitialServerSyncPending).toBe(false));
  });
});
