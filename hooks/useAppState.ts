// Main app state hook — thin orchestrator composing domain hooks
'use client';

import { useState, useEffect, useRef } from 'react';
import type { SyncResponse } from '@/lib/sync';
import type { NormalizedWord } from '@/lib/words';
import { wordListItemsToNormalizedWords } from '@/lib/words';
import { fetchUserData, linkWallet, clearPendingSync, isAuthRequiredError } from '@/lib/sync';
import { useTheme } from './useTheme';
import { useUserProfile } from './useUserProfile';
import { useProgress } from './useProgress';
import { usePreferences } from './usePreferences';
import { useMemoryHooks } from './useMemoryHooks';
import { useCategoryFilter } from './useCategoryFilter';
import { useGameScore } from './useGameScore';

export type { Role } from './usePreferences';
export type { Theme } from './useTheme';

export interface LinkPayload {
  email?: string | null;
  authProvider?: string | null;
}

export function useAppState(
  words: NormalizedWord[],
  walletAddress?: string | undefined,
  linkPayload?: LinkPayload
) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncedWords, setSyncedWords] = useState<NormalizedWord[] | null>(null);
  const [subscribedLists, setSubscribedLists] = useState<{ id: string; name: string }[]>([]);
  const [activeListId, setActiveListIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('wordlink-active-list') ?? null;
  });
  const isHydratedRef = useRef(false);
  const isUpdatingFromServerRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const hasLinkedRef = useRef(false);

  const theme = useTheme();
  const userProfile = useUserProfile();
  const progress = useProgress(isHydrated, isUpdatingFromServerRef);
  const preferences = usePreferences(isHydrated, isUpdatingFromServerRef);
  const memoryHooks = useMemoryHooks(isHydrated, isUpdatingFromServerRef, preferences.role);
  const activeWords = syncedWords ?? words;
  const categories = useCategoryFilter(activeWords, isHydrated, isUpdatingFromServerRef);
  const gameScore = useGameScore(isHydrated, isUpdatingFromServerRef);

  function applyServerData(serverData: SyncResponse) {
    // Discard any pending sync so previous user's data (e.g. game_score) is not sent for the new user
    clearPendingSync();
    if (serverData.progress) progress.applyServerProgress(serverData.progress);
    if (serverData.memory_hooks) memoryHooks.applyServerMemoryHooks(serverData.memory_hooks);
    if (serverData.category_filters) categories.applyServerCategories(serverData.category_filters);
    if (serverData.user) {
      userProfile.applyServerProfile(serverData.user);
      preferences.applyServerPreferences(serverData.user);
    }
    if (serverData.user?.game_score !== undefined) {
      gameScore.applyServerGameScore(serverData.user.game_score);
    }
    // If sync returns word_list_items, convert to NormalizedWord[] for the app
    if (serverData.word_list_items && serverData.word_list_items.length > 0 && serverData.categories) {
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
    }
    if (serverData.lists) {
      setSubscribedLists(serverData.lists);
    }
  }

  function setActiveListId(id: string | null) {
    setActiveListIdState(id);
    if (id) {
      localStorage.setItem('wordlink-active-list', id);
    } else {
      localStorage.removeItem('wordlink-active-list');
    }
  }

  // Hydrate from server once on mount
  useEffect(() => {
    if (hasLoadedRef.current || words.length === 0) return;
    hasLoadedRef.current = true;

    const HYDRATION_TIMEOUT = 15000;
    const timeoutId = setTimeout(() => {
      if (!isHydratedRef.current) {
        console.warn('[useAppState] Hydration timeout — proceeding without server data');
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      }
    }, HYDRATION_TIMEOUT);

    fetchUserData()
      .then((serverData) => {
        clearTimeout(timeoutId);
        isUpdatingFromServerRef.current = true;
        applyServerData(serverData);
        isHydratedRef.current = true;
        setIsHydrated(true);
        requestAnimationFrame(() => {
          isUpdatingFromServerRef.current = false;
        });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (!isAuthRequiredError(err)) {
          console.error('[useAppState] Failed to fetch:', err);
          if (err instanceof Error) {
            console.error('[useAppState] Error message:', err.message);
            console.error('[useAppState] Error stack:', err.stack);
          }
        }
        isHydratedRef.current = true;
        setIsHydrated(true);
        isUpdatingFromServerRef.current = false;
      });

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  // Link wallet when user connects
  useEffect(() => {
    if (!isHydrated || !walletAddress || hasLinkedRef.current) return;
    hasLinkedRef.current = true;
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
        });
      })
      .catch((err) => {
        console.error('[useAppState] Failed to link wallet:', err);
        isUpdatingFromServerRef.current = false;
        hasLinkedRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, walletAddress, linkPayload?.email, linkPayload?.authProvider]);

  // Reset linked state when wallet disconnects
  useEffect(() => {
    if (!walletAddress) hasLinkedRef.current = false;
  }, [walletAddress]);

  const filteredSyncedWords =
    activeListId && syncedWords
      ? syncedWords.filter((w) => w.listId === activeListId)
      : syncedWords;

  return {
    ...theme,
    ...userProfile,
    ...progress,
    ...preferences,
    ...memoryHooks,
    ...categories,
    ...gameScore,
    isHydrated,
    syncedWords: filteredSyncedWords,
    subscribedLists,
    activeListId,
    setActiveListId,
  };
}
