// Main app state hook — thin orchestrator composing domain hooks
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUserProfile } from '@/features/auth/state/userProfile';
import { useActiveListState } from '@/features/learning/app-state/useActiveListState';
import { buildProgressBindings } from '@/features/learning/app-state/progressBindings';
import { useServerSync } from '@/features/learning/app-state/useServerSync';
import { useCategoryFilter, useGameScore, useMemoryHooks, usePreferences, useProgress } from '@/features/learning/state';
import type { NormalizedWord } from '@/lib/words';
import { cacheActiveListAudio } from '@/lib/local-learning-cache';
import { subscribeAudioNetworkChanges } from '@/lib/audio-network-policy';
import { normalizeLanguageCode } from '@/lib/i18n/languages';

export function useAppState(words: NormalizedWord[]) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncedWords, setSyncedWords] = useState<NormalizedWord[] | null>(null);
  const [subscribedLists, setSubscribedLists] = useState<{
    id: string;
    name: string;
    languageFrom: string;
    languageTo: string;
    isRecommended?: boolean;
    isPersonal?: boolean;
    isOwnedPersonal?: boolean;
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
  const activeList = useMemo(
    () => subscribedLists.find((list) => list.id === activeListId) ?? null,
    [activeListId, subscribedLists],
  );
  const ownedPersonalListIds = useMemo(
    () => new Set(subscribedLists.filter((list) => list.isOwnedPersonal).map((list) => list.id)),
    [subscribedLists],
  );
  const personalOverlayListIds = useMemo(() => {
    if (!activeList || activeList.isOwnedPersonal) return new Set<string>();
    const from = normalizeLanguageCode(activeList.languageFrom);
    const to = normalizeLanguageCode(activeList.languageTo);
    return new Set(
      subscribedLists
        .filter(
          (list) =>
            list.isOwnedPersonal &&
            normalizeLanguageCode(list.languageFrom) === from &&
            normalizeLanguageCode(list.languageTo) === to,
        )
        .map((list) => list.id),
    );
  }, [activeList, subscribedLists]);
  const filteredSyncedWords = useMemo(
    () =>
      activeListId && syncedWords
        ? syncedWords.filter(
            (word) =>
              word.listId === activeListId ||
              Boolean(word.listId && personalOverlayListIds.has(word.listId)),
          )
        : syncedWords,
    [activeListId, personalOverlayListIds, syncedWords],
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
    isListRefreshPending,
    refreshFullSnapshot,
  } = useServerSync({
    words,
    isHydrated,
    setIsHydrated,
    isUpdatingFromServerRef,
    applyServerProgress: progressState.applyServerProgress,
    mergeServerProgress: progressState.mergeServerProgress,
    reconcileServerProgress: progressState.reconcileServerProgress,
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
    isListRefreshPending,
    refreshFullSnapshot,
    syncedWords: filteredSyncedWords,
    allSyncedWords: syncedWords,
    subscribedLists,
    activeList,
    activeListId,
    ownedPersonalListIds,
    setActiveListId,
  };
}
