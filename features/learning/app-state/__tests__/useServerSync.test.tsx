import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { SyncResponse } from '@/lib/sync';

const mockFetchUserData = vi.fn<() => Promise<SyncResponse>>();
const mockApplyPendingOutboxToSyncResponse = vi.fn(async (data: SyncResponse) => data);
const mockLoadAllDomainsFromIdb = vi.fn<() => Promise<{ syncResponse: SyncResponse; activeListId: string | null } | null>>();
const mockPersistDomainsToIdb = vi.fn<() => Promise<void>>(async () => undefined);
const mockGetStoragePreference = vi.fn(() => false);
const mockGetSnapshot = vi.fn(async () => null);
const mockSaveSnapshot = vi.fn(async () => true);

vi.mock('@/lib/sync', () => ({
  fetchUserData: () => mockFetchUserData(),
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
}));

vi.mock('@/lib/local-first/stores', () => ({
  getMeta: vi.fn(async () => null),
  putMeta: vi.fn(async () => true),
}));

vi.mock('@/lib/local-learning-cache', () => ({
  getSnapshot: () => mockGetSnapshot(),
  getStoragePreference: () => mockGetStoragePreference(),
  saveSnapshot: () => mockSaveSnapshot(),
}));

import { useServerSync } from '../useServerSync';

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
});
