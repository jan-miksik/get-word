'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchUserData,
  linkWallet,
  clearPendingSync,
  isAuthRequiredError,
  markServerSnapshotApplied,
} from '@/lib/sync';
import { installSyncLifecycle } from '@/lib/sync-coordinator';
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
  applyServerMemoryHooks: (memoryHooks: SyncResponse['memory_hooks']) => void;
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
  applyServerMemoryHooks,
  applyServerCategories,
  applyServerProfile,
  applyServerPreferences,
  applyServerGameScore,
  setSyncedWords,
  setSubscribedLists,
  setActiveListId,
}: UseServerSyncOptions) {
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [hasLinkWalletError, setHasLinkWalletError] = useState(false);
  const isHydratedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const hasLinkedRef = useRef(false);

  const applyServerData = useCallback((
    serverData: SyncResponse,
    options: { clearPending?: boolean; persistSnapshot?: boolean; markServerSnapshot?: boolean } = {}
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
      const role = serverData.user?.role ?? 'vi';
      const converted = wordListItemsToNormalizedWords(
        serverData.word_list_items,
        serverData.categories,
        role as 'cz' | 'vi',
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

  const applyFreshServerData = useCallback((serverData: SyncResponse) => {
    isUpdatingFromServerRef.current = true;
    applyServerData(serverData, { clearPending: false });
    requestAnimationFrame(() => {
      isUpdatingFromServerRef.current = false;
    });
  }, [applyServerData, isUpdatingFromServerRef]);

  const refetchServerData = useCallback(() => {
    if (!isHydratedRef.current) return;
    fetchUserData()
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
      getSnapshot()
        .then((snapshot) => {
          if (cancelled || !snapshot || isHydratedRef.current) return;
          isUpdatingFromServerRef.current = true;
          applyServerData(
            { success: true, ...snapshot.data } as SyncResponse,
            { clearPending: false, persistSnapshot: false, markServerSnapshot: false }
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
    }

    fetchUserData()
      .then((serverData) => {
        clearTimeout(hydrationTimeout);
        isUpdatingFromServerRef.current = true;
        applyServerData(serverData);
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
    return installSyncLifecycle();
  }, [isHydrated]);

  useEffect(() => {
    const onServerSync = (event: Event) => {
      const detail = (event as CustomEvent<SyncResponse>).detail;
      if (detail?.success) applyFreshServerData(detail);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetchServerData();
    };
    const onOnline = () => refetchServerData();

    window.addEventListener('wordlink:server-sync', onServerSync);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('wordlink:server-sync', onServerSync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
    };
  }, [applyFreshServerData, refetchServerData]);

  useEffect(() => {
    if (!isHydrated || !walletAddress || hasLinkedRef.current) return;
    hasLinkedRef.current = true;
    setHasLinkWalletError(false);
    setIsLinkingWallet(true);
    isUpdatingFromServerRef.current = true;
    clearPendingSync();

    linkWallet(walletAddress, {
      email: linkPayload?.email ?? undefined,
      authProvider: linkPayload?.authProvider ?? undefined,
    })
      .then((serverData) => {
        applyServerData(serverData);
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
          setIsLinkingWallet(false);
        });
      })
      .catch((error) => {
        console.error('[useServerSync] Failed to link wallet:', error);
        isUpdatingFromServerRef.current = false;
        hasLinkedRef.current = false;
        setIsLinkingWallet(false);
        setHasLinkWalletError(true);
      });
  }, [applyServerData, isHydrated, isUpdatingFromServerRef, linkPayload?.authProvider, linkPayload?.email, walletAddress]);

  useEffect(() => {
    if (!walletAddress) {
      hasLinkedRef.current = false;
      setIsLinkingWallet(false);
      setHasLinkWalletError(false);
    }
  }, [walletAddress]);

  return {
    isLinkingWallet,
    hasLinkWalletError,
  };
}
