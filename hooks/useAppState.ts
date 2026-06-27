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
import { cacheActiveListAudio } from '@/lib/local-learning-cache';
import { subscribeAudioNetworkChanges } from '@/lib/audio-network-policy';

export type { Role } from '@/features/learning/state';
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
    isRecommended?: boolean;
  }[]>([]);
  const isUpdatingFromServerRef = useRef(false);
  const { activeListId, setActiveListId } = useActiveListState();

  const userProfile = useUserProfile();
  const progressState = useProgress(isHydrated, isUpdatingFromServerRef);
  const preferences = usePreferences(isHydrated, isUpdatingFromServerRef);
  const { role, setRole } = preferences;
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
  const setCustomStage = useCallback(
    (wordId: string, stageIndex: number, opts?: { noRepeat?: boolean }) =>
      progressState.setCustomStage(resolveProgressId(wordId), stageIndex, opts),
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

  // Warm the active list only on a suitable network, resuming after reconnect
  // or a switch back to an unmetered connection.
  useEffect(() => {
    if (!isHydrated || !activeListId || activeWords.length === 0) return;
    const cacheAudio = () => void cacheActiveListAudio(activeWords).catch(() => undefined);
    cacheAudio();
    return subscribeAudioNetworkChanges(cacheAudio);
  }, [activeListId, activeWords, isHydrated]);

  useEffect(() => {
    if (!activeList) return;

    // Lists are directional: languageFrom is the known/source side and
    // languageTo is the learning/target side. Reversed study now uses a
    // separate reversed list instead of flipping the active list locally.
    if (role !== 'knownLanguage') {
      setRole('knownLanguage');
    }
  }, [activeList, role, setRole]);

  const {
    isInitialServerSyncPending,
    isLinkingWallet,
    hasLinkWalletError,
    linkWalletError,
    retryLinkWallet,
  } = useServerSync({
    words,
    isHydrated,
    setIsHydrated,
    walletAddress,
    linkPayload,
    isUpdatingFromServerRef,
    applyServerProgress: progressState.applyServerProgress,
    mergeServerProgress: progressState.mergeServerProgress,
    applyServerMemoryHooks: memoryHooks.applyServerMemoryHooks,
    mergeServerMemoryHooks: memoryHooks.mergeServerMemoryHooks,
    applyServerCategories: categories.applyServerCategories,
    applyServerProfile: userProfile.applyServerProfile,
    applyServerPreferences: preferences.applyServerPreferences,
    applyServerGameScore: gameScore.applyServerGameScore,
    setSyncedWords,
    setSubscribedLists,
    setActiveListId,
  });

  return {
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
    setCustomStage,
    lastMovedId,
    isHydrated,
    isInitialServerSyncPending,
    isLinkingWallet,
    hasLinkWalletError,
    linkWalletError,
    retryLinkWallet,
    syncedWords: filteredSyncedWords,
    subscribedLists,
    activeList,
    activeListId,
    setActiveListId,
  };
}
