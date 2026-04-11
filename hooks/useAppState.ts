// Main app state hook — thin orchestrator composing domain hooks
'use client';

import { useRef, useState } from 'react';
import { useUserProfile } from '@/features/auth/state/userProfile';
import { useActiveListState } from '@/features/learning/app-state/useActiveListState';
import { useServerSync } from '@/features/learning/app-state/useServerSync';
import { useCategoryFilter, useGameScore, useMemoryHooks, usePreferences, useProgress } from '@/features/learning/state';
import type { LinkPayload } from '@/features/learning/app-state/types';
import type { NormalizedWord } from '@/lib/words';
import { useTheme } from './useTheme';

export type { Role } from '@/features/learning/state';
export type { Theme } from './useTheme';
export type { LinkPayload } from '@/features/learning/app-state/types';

export function useAppState(
  words: NormalizedWord[],
  walletAddress?: string | undefined,
  linkPayload?: LinkPayload
) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncedWords, setSyncedWords] = useState<NormalizedWord[] | null>(null);
  const [subscribedLists, setSubscribedLists] = useState<{ id: string; name: string }[]>([]);
  const isUpdatingFromServerRef = useRef(false);
  const { activeListId, setActiveListId } = useActiveListState();

  const theme = useTheme();
  const userProfile = useUserProfile();
  const progress = useProgress(isHydrated, isUpdatingFromServerRef);
  const preferences = usePreferences(isHydrated, isUpdatingFromServerRef);
  const memoryHooks = useMemoryHooks(isHydrated, isUpdatingFromServerRef, preferences.role);
  const activeWords = syncedWords ?? words;
  const categories = useCategoryFilter(activeWords, isHydrated, isUpdatingFromServerRef);
  const gameScore = useGameScore(isHydrated, isUpdatingFromServerRef);

  const { isLinkingWallet, hasLinkWalletError } = useServerSync({
    words,
    isHydrated,
    setIsHydrated,
    walletAddress,
    linkPayload,
    isUpdatingFromServerRef,
    applyServerProgress: progress.applyServerProgress,
    applyServerMemoryHooks: memoryHooks.applyServerMemoryHooks,
    applyServerCategories: categories.applyServerCategories,
    applyServerProfile: userProfile.applyServerProfile,
    applyServerPreferences: preferences.applyServerPreferences,
    applyServerGameScore: gameScore.applyServerGameScore,
    setSyncedWords,
    setSubscribedLists,
    setActiveListId,
  });

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
    isLinkingWallet,
    hasLinkWalletError,
    syncedWords: filteredSyncedWords,
    subscribedLists,
    activeListId,
    setActiveListId,
  };
}
