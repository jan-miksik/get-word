'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchUserData, linkWallet, clearPendingSync, isAuthRequiredError } from '@/lib/sync';
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
  setSubscribedLists: React.Dispatch<React.SetStateAction<{ id: string; name: string }[]>>;
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
  const shouldLogPerf = process.env.NEXT_PUBLIC_DEBUG_TIMING === '1';
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [hasLinkWalletError, setHasLinkWalletError] = useState(false);
  const isHydratedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const hasLinkedRef = useRef(false);

  function applyServerData(serverData: SyncResponse) {
    const applyStart = performance.now();
    clearPendingSync();
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
    if (serverData.word_list_items && serverData.word_list_items.length > 0 && serverData.categories) {
      const convertStart = performance.now();
      const role = serverData.user?.role ?? 'vi';
      const converted = wordListItemsToNormalizedWords(
        serverData.word_list_items,
        serverData.categories,
        role as 'cz' | 'vi',
        { mediaFallbackWords: words }
      );
      if (converted.length > 0) {
        setSyncedWords(converted);
      }
      if (shouldLogPerf) {
        console.info(
          `[timing] useServerSync.wordListItemsToNormalizedWords ${(performance.now() - convertStart).toFixed(1)}ms (${serverData.word_list_items.length} items)`
        );
      }
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
    if (shouldLogPerf) {
      console.info(`[timing] useServerSync.applyServerData ${(performance.now() - applyStart).toFixed(1)}ms`);
    }
  }

  useEffect(() => {
    if (hasLoadedRef.current || words.length === 0) return;
    hasLoadedRef.current = true;
    const hydrationStart = performance.now();

    const hydrationTimeout = setTimeout(() => {
      if (!isHydratedRef.current) {
        console.warn('[useServerSync] Hydration timeout — proceeding without server data');
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      }
    }, 15000);

    fetchUserData()
      .then((serverData) => {
        clearTimeout(hydrationTimeout);
        isUpdatingFromServerRef.current = true;
        applyServerData(serverData);
        isHydratedRef.current = true;
        setIsHydrated(true);
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
          if (shouldLogPerf) {
            console.info(`[timing] useServerSync.initialHydration ${(performance.now() - hydrationStart).toFixed(1)}ms`);
          }
        });
      })
      .catch((error) => {
        clearTimeout(hydrationTimeout);
        if (!isAuthRequiredError(error)) {
          console.error('[useServerSync] Failed to fetch:', error);
          if (error instanceof Error) {
            console.error('[useServerSync] Error message:', error.message);
            console.error('[useServerSync] Error stack:', error.stack);
          }
        }
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
        if (shouldLogPerf) {
          console.info(`[timing] useServerSync.initialHydrationFailed ${(performance.now() - hydrationStart).toFixed(1)}ms`);
        }
      });

    return () => clearTimeout(hydrationTimeout);
  }, [applyServerCategories, applyServerGameScore, applyServerMemoryHooks, applyServerPreferences, applyServerProfile, applyServerProgress, isUpdatingFromServerRef, setActiveListId, words]);

  useEffect(() => {
    if (!isHydrated || !walletAddress || hasLinkedRef.current) return;
    const linkStart = performance.now();
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
          if (shouldLogPerf) {
            console.info(`[timing] useServerSync.linkWalletHydration ${(performance.now() - linkStart).toFixed(1)}ms`);
          }
        });
      })
      .catch((error) => {
        console.error('[useServerSync] Failed to link wallet:', error);
        isUpdatingFromServerRef.current = false;
        hasLinkedRef.current = false;
        setIsLinkingWallet(false);
        setHasLinkWalletError(true);
      });
  }, [applyServerCategories, applyServerGameScore, applyServerMemoryHooks, applyServerPreferences, applyServerProfile, applyServerProgress, isHydrated, isUpdatingFromServerRef, linkPayload?.authProvider, linkPayload?.email, setActiveListId, walletAddress, words]);

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
