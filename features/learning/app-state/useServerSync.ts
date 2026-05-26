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
import { startDrainer } from '@/lib/local-first/drainer';
import {
  applyPendingOutboxToSyncResponse,
  loadAllDomainsFromIdb,
  persistDomainsToIdb,
} from '@/lib/local-first/hydrate';
import { getMeta, putMeta } from '@/lib/local-first/stores';
import { getSnapshot, getStoragePreference, saveSnapshot } from '@/lib/local-learning-cache';
import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';
import { wordListItemsToNormalizedWords } from '@/lib/words';
import { readStoredActiveListId } from './storage';
import type { LinkPayload } from './types';

interface UseServerSyncOptions {
  words: NormalizedWord[];
  isHydrated: boolean;
  setIsHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  walletAddress?: string;
  linkPayload?: LinkPayload;
  isUpdatingFromServerRef: React.MutableRefObject<boolean>;
  applyServerProgress: (progress: SyncResponse['progress']) => void;
  mergeServerProgress: (progress: SyncResponse['progress']) => void;
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
  const isHydratedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const linkedIdentityRef = useRef<string | null>(null);
  const linkAttemptRef = useRef(0);

  const applyServerData = useCallback((
    serverData: SyncResponse,
    options: { clearPending?: boolean; persistSnapshot?: boolean; markServerSnapshot?: boolean; persistDomains?: boolean } = {}
  ) => {
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
      }
    }
    if (options.markServerSnapshot ?? true) {
      markServerSnapshotApplied();
    }
    if (options.persistSnapshot ?? true) {
      void saveSnapshot(serverData, readStoredActiveListId()).catch(() => undefined);
    }
    if ((options.persistDomains ?? true) && getStoragePreference()) {
      void persistDomainsToIdb(serverData).catch(() => undefined);
    }
    if (typeof serverData.sync_revision === 'number' && getStoragePreference()) {
      void putMeta({ lastSinceCursor: String(serverData.sync_revision) }).catch(() => undefined);
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

  const applyServerDelta = useCallback((delta: SyncResponse) => {
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
    if (typeof delta.sync_revision === 'number' && getStoragePreference()) {
      void putMeta({ lastSinceCursor: String(delta.sync_revision) }).catch(() => undefined);
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
    if (serverData.is_delta) {
      applyServerDelta(overlaidServerData);
    } else {
      applyServerData(overlaidServerData, { clearPending: false });
    }
    requestAnimationFrame(() => {
      isUpdatingFromServerRef.current = false;
    });
  }, [applyServerData, applyServerDelta, isUpdatingFromServerRef]);

  const refetchServerData = useCallback(() => {
    if (!isHydratedRef.current) return;
    (async () => {
      let since: string | undefined;
      if (getStoragePreference()) {
        const meta = await getMeta().catch(() => null);
        if (meta?.lastSinceCursor) since = meta.lastSinceCursor;
      }
      return fetchUserData(since ? { since } : undefined);
    })()
      .then(applyFreshServerData)
      .catch((error) => {
        if (!isAuthRequiredError(error)) {
          console.error('[useServerSync] Failed to refresh:', error);
        }
      });
  }, [applyFreshServerData]);

  useEffect(() => {
    if (hasLoadedRef.current || words.length === 0) return;
    hasLoadedRef.current = true;

    const hydrationTimeout = setTimeout(() => {
      if (!isHydratedRef.current) {
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      }
    }, 15000);

    let cancelled = false;
    if (getStoragePreference()) {
      const warmFromIdb = async () => {
        const idbHydration = await loadAllDomainsFromIdb().catch(() => null);
        if (cancelled || isHydratedRef.current) return true;
        if (idbHydration) {
          isUpdatingFromServerRef.current = true;
          applyServerData(idbHydration.syncResponse, {
            clearPending: false,
            persistSnapshot: false,
            persistDomains: false,
            markServerSnapshot: false,
          });
          if (idbHydration.activeListId) {
            setActiveListId(idbHydration.activeListId);
          }
          isHydratedRef.current = true;
          setIsHydrated(true);
          requestAnimationFrame(() => {
            isUpdatingFromServerRef.current = false;
          });
          return true;
        }
        return false;
      };

      void warmFromIdb().then((warmed) => {
        if (warmed || cancelled || isHydratedRef.current) return;
        return getSnapshot()
          .then((snapshot) => {
            if (cancelled || !snapshot || isHydratedRef.current) return;
            isUpdatingFromServerRef.current = true;
            applyServerData(
              { success: true, ...snapshot.data } as SyncResponse,
              { clearPending: false, persistSnapshot: false, persistDomains: false, markServerSnapshot: false }
            );
            if (snapshot.activeListId) {
              setActiveListId(snapshot.activeListId);
            }
            isHydratedRef.current = true;
            setIsHydrated(true);
            requestAnimationFrame(() => {
              isUpdatingFromServerRef.current = false;
            });
          })
          .catch(() => undefined);
      });
    }

    fetchUserData()
      .then(async (serverData) => {
        clearTimeout(hydrationTimeout);
        isUpdatingFromServerRef.current = true;
        const overlaidServerData = await applyPendingOutboxToSyncResponse(
          serverData,
          serverData.submitted_review_events ?? []
        ).catch(() => serverData);
        applyServerData(overlaidServerData);
        isHydratedRef.current = true;
        setIsHydrated(true);
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
      })
      .catch((error) => {
        clearTimeout(hydrationTimeout);
        if (!isAuthRequiredError(error)) {
          console.error('[useServerSync] Failed to fetch:', error);
        }
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      });

    return () => {
      cancelled = true;
      clearTimeout(hydrationTimeout);
    };
  }, [applyServerData, isUpdatingFromServerRef, setActiveListId, setIsHydrated, words.length]);

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
    const onOnline = () => refetchServerData();

    window.addEventListener('get-word:server-sync', onServerSync);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('get-word:server-sync', onServerSync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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
      .then((serverData) => {
        if (linkAttemptRef.current !== attemptId) return;
        applyServerData(serverData);
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
      setIsLinkingWallet(false);
      setLinkWalletError(null);
    }
  }, [walletAddress]);

  return {
    isLinkingWallet,
    hasLinkWalletError: linkWalletError !== null,
    linkWalletError,
    retryLinkWallet,
  };
}
