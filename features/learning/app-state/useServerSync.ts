'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchUserData,
  linkWalletWithRetry,
  clearPendingSync,
  isAuthRequiredError,
  markServerSnapshotApplied,
} from '@/lib/sync';
import { installSyncLifecycle } from '@/lib/sync-coordinator';
import { flushOutboxBeforeRead, startDrainer } from '@/lib/local-first/drainer';
import {
  applyPendingOutboxToSyncResponse,
  loadAllDomainsFromIdb,
  persistDeltaToIdb,
  persistDomainsToIdb,
} from '@/lib/local-first/hydrate';
import { getMeta, putMeta } from '@/lib/local-first/stores';
import { getSnapshot, getStoragePreference, saveSnapshot } from '@/lib/local-learning-cache';
import { consumeListsChangedForLearningSync } from '@/features/shared/sync/list-refresh-marker';
import type { SyncResponse } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';
import { wordListItemsToNormalizedWords } from '@/lib/words';
import { readStoredActiveListId } from './storage';
import type { LinkPayload } from './types';

// Collapses the focus/visibilitychange/pageshow event burst (returning to the
// app fires all three) into one conditional refetch.
const REFETCH_THROTTLE_MS = 5 * 60_000;

// Cold boot with nothing cached: how long we wait for the server before giving
// up and letting the app render whatever local state it has.
const HYDRATION_TIMEOUT_MS = 15_000;

// Warm boot: the IndexedDB cache already produced a complete, usable state, so
// the server fetch only has this long to improve on it before we stop waiting.
export const WARM_START_SYNC_GRACE_MS = 4_000;

type BootTimers = {
  hydration?: ReturnType<typeof setTimeout>;
  warmFallback?: ReturnType<typeof setTimeout>;
};

function clearBootTimers(timers: BootTimers): void {
  clearTimeout(timers.hydration);
  clearTimeout(timers.warmFallback);
}

interface UseServerSyncOptions {
  words: NormalizedWord[];
  isHydrated: boolean;
  setIsHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  walletAddress?: string;
  linkPayload?: LinkPayload;
  isUpdatingFromServerRef: React.MutableRefObject<boolean>;
  applyServerProgress: (progress: SyncResponse['progress']) => void;
  mergeServerProgress: (progress: SyncResponse['progress']) => void;
  reconcileServerProgress: (data: SyncResponse) => SyncResponse;
  applyServerMemoryHooks: (memoryHooks: SyncResponse['memory_hooks']) => void;
  mergeServerMemoryHooks: (updated: SyncResponse['memory_hooks'], deleted: string[]) => void;
  applyServerCategories: (categories: SyncResponse['category_filters']) => void;
  applyServerProfile: (user: SyncResponse['user']) => void;
  applyServerPreferences: (user: SyncResponse['user']) => void;
  applyServerGameScore: (score: number) => void;
  setSyncedWords: React.Dispatch<React.SetStateAction<NormalizedWord[] | null>>;
  setSubscribedLists: React.Dispatch<React.SetStateAction<{
    id: string;
    name: string;
    languageFrom: string;
    languageTo: string;
    isRecommended?: boolean;
  }[]>>;
  setActiveListId: (id: string | null) => void;
}

export function useServerSync({
  words,
  isHydrated,
  setIsHydrated,
  walletAddress,
  linkPayload,
  isUpdatingFromServerRef,
  applyServerProgress,
  mergeServerProgress,
  reconcileServerProgress,
  applyServerMemoryHooks,
  mergeServerMemoryHooks,
  applyServerCategories,
  applyServerProfile,
  applyServerPreferences,
  applyServerGameScore,
  setSyncedWords,
  setSubscribedLists,
  setActiveListId,
}: UseServerSyncOptions) {
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [linkWalletError, setLinkWalletError] = useState<string | null>(null);
  const [linkRetryNonce, setLinkRetryNonce] = useState(0);
  const [isInitialServerSyncPending, setIsInitialServerSyncPending] = useState(true);
  const [isListRefreshPending, setIsListRefreshPending] = useState(false);
  const isHydratedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const bootTimersRef = useRef<BootTimers>({});
  const lastRefetchAtRef = useRef(0);
  const linkedIdentityRef = useRef<string | null>(null);
  const linkAttemptRef = useRef(0);
  const applyCachedActiveListId = useCallback((cachedActiveListId: string | null | undefined) => {
    if (!cachedActiveListId) return;
    if (readStoredActiveListId()) return;
    setActiveListId(cachedActiveListId);
  }, [setActiveListId]);

  const applyServerData = useCallback(async (
    serverData: SyncResponse,
    options: { clearPending?: boolean; persistSnapshot?: boolean; markServerSnapshot?: boolean; persistDomains?: boolean } = {}
  ): Promise<void> => {
    if (options.clearPending ?? true) {
      clearPendingSync();
    }
    if (serverData.progress) applyServerProgress(serverData.progress);
    if (serverData.memory_hooks) applyServerMemoryHooks(serverData.memory_hooks);
    if (serverData.category_filters) applyServerCategories(serverData.category_filters);
    if (serverData.user) {
      applyServerProfile(serverData.user);
      applyServerPreferences(serverData.user);
    }
    if (serverData.user?.game_score !== undefined) {
      applyServerGameScore(serverData.user.game_score);
    }
    if (serverData.word_list_items && serverData.categories) {
      const converted = wordListItemsToNormalizedWords(
        serverData.word_list_items,
        serverData.categories,
        { mediaFallbackWords: words }
      );
      setSyncedWords(converted);
    }
    if (serverData.lists) {
      setSubscribedLists(serverData.lists);
      if (serverData.lists.length > 0) {
        const currentId = readStoredActiveListId();
        const isValid = serverData.lists.some((list) => list.id === currentId);
        if (!currentId || !isValid) {
          setActiveListId(serverData.lists[0].id);
        }
      } else {
        setActiveListId(null);
      }
    }
    if (options.markServerSnapshot ?? true) {
      markServerSnapshotApplied();
    }
    if (getStoragePreference()) {
      const shouldPersistSnapshot = options.persistSnapshot ?? true;
      const shouldPersistDomains = options.persistDomains ?? true;
      const [snapshotSaved, domainsSaved] = await Promise.all([
        shouldPersistSnapshot
          ? saveSnapshot(serverData, readStoredActiveListId()).catch(() => false)
          : Promise.resolve(true),
        shouldPersistDomains
          ? persistDomainsToIdb(serverData).catch(() => false)
          : Promise.resolve(true),
      ]);

      // A cursor may only describe data that is already durable. If either
      // persistence path failed, retain the old cursor so the next GET safely
      // replays the snapshot/delta instead of reporting unchanged.
      if (!snapshotSaved || !domainsSaved) return;

      const metaPatch: { lastSinceCursor?: string; lastContentRevision?: string } = {};
      if (typeof serverData.sync_revision === 'number') {
        metaPatch.lastSinceCursor = String(serverData.sync_revision);
      }
      // Only full snapshots carry content_revision; storing it marks the
      // cached word lists as matching that server state.
      if (typeof serverData.content_revision === 'string') {
        metaPatch.lastContentRevision = serverData.content_revision;
      }
      if (Object.keys(metaPatch).length > 0) {
        await putMeta(metaPatch).catch(() => false);
      }
    }
  }, [
    applyServerCategories,
    applyServerGameScore,
    applyServerMemoryHooks,
    applyServerPreferences,
    applyServerProfile,
    applyServerProgress,
    setActiveListId,
    setSubscribedLists,
    setSyncedWords,
    words,
  ]);

  const applyServerDelta = useCallback(async (delta: SyncResponse): Promise<void> => {
    if (delta.progress) mergeServerProgress(delta.progress);
    mergeServerMemoryHooks(delta.memory_hooks ?? {}, delta.memory_hooks_deleted ?? []);
    if (delta.category_filters) applyServerCategories(delta.category_filters);
    if (delta.user) {
      applyServerProfile(delta.user);
      applyServerPreferences(delta.user);
    }
    if (delta.user?.game_score !== undefined) {
      applyServerGameScore(delta.user.game_score);
    }
    if (getStoragePreference()) {
      await persistDeltaToIdb(delta).catch(() => false);
    }
  }, [
    applyServerCategories,
    applyServerGameScore,
    applyServerPreferences,
    applyServerProfile,
    mergeServerMemoryHooks,
    mergeServerProgress,
  ]);

  const applyFreshServerData = useCallback(async (serverData: SyncResponse) => {
    isUpdatingFromServerRef.current = true;
    const overlaidServerData = await applyPendingOutboxToSyncResponse(
      serverData,
      serverData.submitted_review_events ?? []
    ).catch(() => serverData);
    // The outbox overlay only covers mutations still waiting to be sent. Rows
    // whose ops were already acknowledged are protected by the reconciliation
    // instead, which compares the payload against what this device holds.
    const freshServerData = reconcileServerProgress(overlaidServerData);
    if (serverData.is_delta) {
      await applyServerDelta(freshServerData);
    } else {
      await applyServerData(freshServerData, { clearPending: false });
    }
    requestAnimationFrame(() => {
      isUpdatingFromServerRef.current = false;
    });
  }, [applyServerData, applyServerDelta, isUpdatingFromServerRef, reconcileServerProgress]);

  const refetchServerData = useCallback(() => {
    if (!isHydratedRef.current) return;
    const listRefreshMarker = consumeListsChangedForLearningSync();
    const forceFullRefresh = Boolean(listRefreshMarker);
    if (listRefreshMarker?.listId) {
      setActiveListId(listRefreshMarker.listId);
    }
    // Returning to the app fires focus + visibilitychange + pageshow at once;
    // collapse the burst into a single conditional fetch.
    const now = Date.now();
    if (!forceFullRefresh && now - lastRefetchAtRef.current < REFETCH_THROTTLE_MS) return;
    lastRefetchAtRef.current = now;
    if (forceFullRefresh) {
      setIsListRefreshPending(true);
    }
    (async () => {
      // Send before reading: the drainer answers the same focus/visibility
      // events this refetch does, and a read that overtakes the write comes
      // back describing state from before the user's last review.
      await flushOutboxBeforeRead();
      let since: string | undefined;
      let contentRev: string | undefined;
      if (getStoragePreference()) {
        const meta = await getMeta().catch(() => null);
        if (meta?.lastSinceCursor) since = meta.lastSinceCursor;
        if (meta?.lastContentRevision) contentRev = meta.lastContentRevision;
      }
      return fetchUserData(!forceFullRefresh && since ? { since, contentRev } : undefined);
    })()
      .then(applyFreshServerData)
      .catch((error) => {
        if (!isAuthRequiredError(error)) {
          console.error('[useServerSync] Failed to refresh:', error);
        }
      })
      .finally(() => {
        if (forceFullRefresh) {
          setIsListRefreshPending(false);
        }
      });
  }, [applyFreshServerData, setActiveListId]);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    // Timer handles live in a ref, not in this closure. `hasLoadedRef` makes
    // the boot a singleton, but the effect's deps still change (applyServerData
    // is memoized on `words`), so it re-runs — and a cleanup that owned these
    // handles would clear the very safety nets meant to unstick a stalled boot.
    const timers = bootTimersRef.current;

    timers.hydration = setTimeout(() => {
      if (!isHydratedRef.current) {
        isHydratedRef.current = true;
        setIsHydrated(true);
        setIsInitialServerSyncPending(false);
        isUpdatingFromServerRef.current = false;
      }
    }, HYDRATION_TIMEOUT_MS);

    const warmFromIdb = async () => {
      const idbHydration = await loadAllDomainsFromIdb().catch(() => null);
      if (isHydratedRef.current) return true;
      if (idbHydration) {
        isUpdatingFromServerRef.current = true;
        await applyServerData(idbHydration.syncResponse, {
          clearPending: false,
          persistSnapshot: false,
          persistDomains: false,
          markServerSnapshot: false,
        });
        applyCachedActiveListId(idbHydration.activeListId);
        isHydratedRef.current = true;
        setIsHydrated(true);
        // Deliberately do NOT release `isInitialServerSyncPending` here: the
        // study plan is memoized on it, so starting from the cache and then
        // reshuffling once the server answers would move cards under the user.
        // Instead shorten the ceiling — the cache is a complete, usable state,
        // so there is no reason to wait the full cold-boot budget for a network
        // that may never answer.
        timers.warmFallback = setTimeout(() => {
          setIsInitialServerSyncPending(false);
        }, WARM_START_SYNC_GRACE_MS);
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
        return true;
      }
      return false;
    };

    const boot = async () => {
      // When the cache warm-start succeeds, the boot fetch can be conditional:
      // the server sends the full snapshot only if the cursors no longer match.
      let conditional: { since: string; contentRev: string } | undefined;
      const listRefreshMarker = consumeListsChangedForLearningSync();
      if (listRefreshMarker?.listId) {
        setActiveListId(listRefreshMarker.listId);
      }
      if (getStoragePreference()) {
        const warmed = await warmFromIdb().catch(() => false);
        if (!warmed && !isHydratedRef.current) {
          await getSnapshot()
            .then(async (snapshot) => {
              if (!snapshot || isHydratedRef.current) return;
              isUpdatingFromServerRef.current = true;
              await applyServerData(
                { success: true, ...snapshot.data } as SyncResponse,
                { clearPending: false, persistSnapshot: false, persistDomains: false, markServerSnapshot: false }
              );
              applyCachedActiveListId(snapshot.activeListId);
              isHydratedRef.current = true;
              setIsHydrated(true);
              requestAnimationFrame(() => {
                isUpdatingFromServerRef.current = false;
              });
            })
            .catch(() => undefined);
        }
        if (warmed && !listRefreshMarker) {
          const meta = await getMeta().catch(() => null);
          if (meta?.lastSinceCursor && meta.lastContentRevision) {
            conditional = {
              since: meta.lastSinceCursor,
              contentRev: meta.lastContentRevision,
            };
          }
        }
      }

      const serverData = await fetchUserData(conditional);
      clearBootTimers(timers);
      isUpdatingFromServerRef.current = true;
      const overlaidServerData = await applyPendingOutboxToSyncResponse(
        serverData,
        serverData.submitted_review_events ?? []
      ).catch(() => serverData);
      const freshServerData = reconcileServerProgress(overlaidServerData);
      if (serverData.is_delta) {
        await applyServerDelta(freshServerData);
      } else {
        await applyServerData(freshServerData);
      }
      isHydratedRef.current = true;
      setIsHydrated(true);
      setIsInitialServerSyncPending(false);
      requestAnimationFrame(() => {
        isUpdatingFromServerRef.current = false;
      });
    };

    boot().catch((error) => {
      clearBootTimers(timers);
      if (!isAuthRequiredError(error)) {
        console.error('[useServerSync] Failed to fetch:', error);
      }
      isHydratedRef.current = true;
      setIsHydrated(true);
      setIsInitialServerSyncPending(false);
      isUpdatingFromServerRef.current = false;
    });

  }, [
    applyCachedActiveListId,
    applyServerData,
    applyServerDelta,
    isUpdatingFromServerRef,
    reconcileServerProgress,
    setActiveListId,
    setIsHydrated,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    const lifecycle = startDrainer();
    const cleanup = installSyncLifecycle();
    return () => {
      cleanup();
      lifecycle.stop();
    };
  }, [isHydrated]);

  useEffect(() => {
    const onServerSync = (event: Event) => {
      const detail = (event as CustomEvent<SyncResponse>).detail;
      if (detail?.success) void applyFreshServerData(detail);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetchServerData();
    };
    const onFocus = () => refetchServerData();
    const onPageShow = () => refetchServerData();
    const onOnline = () => refetchServerData();

    window.addEventListener('get-word:server-sync', onServerSync);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('get-word:server-sync', onServerSync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, [applyFreshServerData, refetchServerData]);

  const retryLinkWallet = useCallback(() => {
    linkedIdentityRef.current = null;
    setLinkWalletError(null);
    setLinkRetryNonce((nonce) => nonce + 1);
  }, []);

  useEffect(() => {
    if (!isHydrated || !walletAddress) return;
    const identityKey = [
      walletAddress.toLowerCase(),
      linkPayload?.email?.trim().toLowerCase() ?? '',
      linkPayload?.authProvider?.trim().toLowerCase() ?? '',
    ].join('|');
    if (linkedIdentityRef.current === identityKey) return;
    linkedIdentityRef.current = identityKey;
    const attemptId = linkAttemptRef.current + 1;
    linkAttemptRef.current = attemptId;
    setLinkWalletError(null);
    setIsLinkingWallet(true);
    isUpdatingFromServerRef.current = true;
    clearPendingSync();

    linkWalletWithRetry(walletAddress, {
      email: linkPayload?.email ?? undefined,
      authProvider: linkPayload?.authProvider ?? undefined,
    })
      .then(async (serverData) => {
        if (linkAttemptRef.current !== attemptId) return;
        await applyServerData(serverData);
        requestAnimationFrame(() => {
          if (linkAttemptRef.current !== attemptId) return;
          isUpdatingFromServerRef.current = false;
          setIsLinkingWallet(false);
        });
      })
      .catch((error) => {
        if (linkAttemptRef.current !== attemptId) return;
        console.error('[useServerSync] Failed to link wallet:', error);
        isUpdatingFromServerRef.current = false;
        linkedIdentityRef.current = null;
        setIsLinkingWallet(false);
        setLinkWalletError(
          'We connected your account, but could not finish signing you in. Please try again.'
        );
      });
  }, [applyServerData, isHydrated, isUpdatingFromServerRef, linkPayload?.authProvider, linkPayload?.email, linkRetryNonce, walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      linkAttemptRef.current += 1;
      linkedIdentityRef.current = null;
    }
  }, [walletAddress]);

  const visibleLinkWalletError = walletAddress ? linkWalletError : null;

  return {
    isInitialServerSyncPending,
    isLinkingWallet: Boolean(walletAddress) && isLinkingWallet,
    hasLinkWalletError: visibleLinkWalletError !== null,
    linkWalletError: visibleLinkWalletError,
    retryLinkWallet,
    isListRefreshPending,
  };
}
