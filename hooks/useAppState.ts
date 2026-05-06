// Main app state hook — thin orchestrator composing domain hooks
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserProfile } from '@/features/auth/state/userProfile';
import { useActiveListState } from '@/features/learning/app-state/useActiveListState';
import { buildProgressBindings } from '@/features/learning/app-state/progressBindings';
import { useServerSync } from '@/features/learning/app-state/useServerSync';
import { useCategoryFilter, useGameScore, useMemoryHooks, usePreferences, useProgress } from '@/features/learning/state';
import type { LinkPayload } from '@/features/learning/app-state/types';
import type { NormalizedWord } from '@/lib/words';
import { useTheme } from './useTheme';
import { readStoredLearningRoleForPair } from '@/features/learning/app-state/storage';

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
  const [subscribedLists, setSubscribedLists] = useState<{
    id: string;
    name: string;
    languageFrom: string;
    languageTo: string;
  }[]>([]);
  const isUpdatingFromServerRef = useRef(false);
  const { activeListId, setActiveListId } = useActiveListState();

  const theme = useTheme();
  const userProfile = useUserProfile();
  const progressState = useProgress(isHydrated, isUpdatingFromServerRef);
  const preferences = usePreferences(isHydrated, isUpdatingFromServerRef);
  const memoryHooks = useMemoryHooks(isHydrated, isUpdatingFromServerRef, preferences.role);
  const allWords = syncedWords ?? words;
  const progressBindings = useMemo(
    () => buildProgressBindings(allWords, progressState.progress),
    [allWords, progressState.progress]
  );
  const progress = useMemo(() => {
    if (progressBindings.size === 0) {
      return progressState.progress;
    }

    const resolved = { ...progressState.progress };
    for (const word of allWords) {
      const boundProgressId = progressBindings.get(word.id);
      const boundProgress = boundProgressId ? progressState.progress[boundProgressId] : undefined;
      if (boundProgress) {
        resolved[word.id] = boundProgress;
      }
    }
    return resolved;
  }, [allWords, progressBindings, progressState.progress]);
  const resolveProgressId = useCallback(
    (wordId: string) => progressBindings.get(wordId) ?? wordId,
    [progressBindings]
  );
  const markKnown = useCallback(
    (wordId: string) => progressState.markKnown(resolveProgressId(wordId)),
    [progressState, resolveProgressId]
  );
  const markReallyKnown = useCallback(
    (wordId: string) => progressState.markReallyKnown(resolveProgressId(wordId)),
    [progressState, resolveProgressId]
  );
  const markUnknown = useCallback(
    (wordId: string) => progressState.markUnknown(resolveProgressId(wordId)),
    [progressState, resolveProgressId]
  );
  const lastMovedId = useMemo(() => {
    if (!progressState.lastMovedId) return null;
    for (const word of allWords) {
      if ((progressBindings.get(word.id) ?? word.id) === progressState.lastMovedId) {
        return word.id;
      }
    }
    return progressState.lastMovedId;
  }, [allWords, progressBindings, progressState.lastMovedId]);
  const filteredSyncedWords = useMemo(
    () =>
      activeListId && syncedWords
        ? syncedWords.filter((w) => w.listId === activeListId)
        : syncedWords,
    [activeListId, syncedWords]
  );
  const activeWords = filteredSyncedWords ?? words;
  const categoryScopeKey = activeListId ?? '__default__';
  const categories = useCategoryFilter(
    activeWords,
    isHydrated,
    isUpdatingFromServerRef,
    categoryScopeKey
  );
  const gameScore = useGameScore(isHydrated, isUpdatingFromServerRef);

  const activeList = useMemo(
    () => subscribedLists.find((list) => list.id === activeListId) ?? null,
    [activeListId, subscribedLists],
  );

  useEffect(() => {
    if (!activeList) return;

    const storedRole = readStoredLearningRoleForPair(activeList.languageFrom, activeList.languageTo);
    let preferredRole = storedRole;

    if (!preferredRole && preferences.learningLanguageFrom && preferences.learningLanguageTo) {
      if (
        preferences.learningLanguageFrom === activeList.languageFrom &&
        preferences.learningLanguageTo === activeList.languageTo
      ) {
        preferredRole = 'cz';
      } else if (
        preferences.learningLanguageFrom === activeList.languageTo &&
        preferences.learningLanguageTo === activeList.languageFrom
      ) {
        preferredRole = 'vi';
      }
    }

    if (preferredRole && preferredRole !== preferences.role) {
      preferences.setRole(preferredRole);
    }
  }, [
    activeList,
    preferences.learningLanguageFrom,
    preferences.learningLanguageTo,
    preferences.role,
    preferences.setRole,
  ]);

  const { isLinkingWallet, hasLinkWalletError } = useServerSync({
    words,
    isHydrated,
    setIsHydrated,
    walletAddress,
    linkPayload,
    isUpdatingFromServerRef,
    applyServerProgress: progressState.applyServerProgress,
    applyServerMemoryHooks: memoryHooks.applyServerMemoryHooks,
    applyServerCategories: categories.applyServerCategories,
    applyServerProfile: userProfile.applyServerProfile,
    applyServerPreferences: preferences.applyServerPreferences,
    applyServerGameScore: gameScore.applyServerGameScore,
    setSyncedWords,
    setSubscribedLists,
    setActiveListId,
  });

  return {
    ...theme,
    ...userProfile,
    ...progressState,
    ...preferences,
    ...memoryHooks,
    ...categories,
    ...gameScore,
    progress,
    markKnown,
    markReallyKnown,
    markUnknown,
    lastMovedId,
    isHydrated,
    isLinkingWallet,
    hasLinkWalletError,
    syncedWords: filteredSyncedWords,
    subscribedLists,
    activeList,
    activeListId,
    setActiveListId,
  };
}
