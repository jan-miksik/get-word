'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ProgressData } from '@/features/sync/types';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import { useLearningStreamGroups } from './useLearningStreamGroups';
import { useWordStream } from './useWordStream';
import type { ViewMode } from '../app-state/types';

interface UseLearningPageStateOptions {
  activeWords: NormalizedWord[];
  filteredWords: NormalizedWord[];
  selectedCategories: Set<string>;
  progress: Record<string, ProgressData>;
  isHydrated: boolean;
  viewMode: ViewMode;
  minigameFrequency: MinigameFrequencyRange;
  categoryOrder: string[];
  dueTimerRevision?: number;
  typingModeEnabled?: boolean;
  tiltGameEnabled?: boolean;
  progressPlanRevision?: string | number;
}

type LearningUiState = {
  resetKey: string;
  showNotReady: boolean;
  dismissedGames: Set<string>;
};

function resolveStateAction<T>(action: SetStateAction<T>, previous: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(previous) : action;
}

function useResettableLearningUiState(resetKey: string): {
  showNotReady: boolean;
  setShowNotReady: Dispatch<SetStateAction<boolean>>;
  dismissedGames: Set<string>;
  setDismissedGames: Dispatch<SetStateAction<Set<string>>>;
} {
  const [stored, setStored] = useState<LearningUiState>(() => ({
    resetKey,
    showNotReady: false,
    dismissedGames: new Set(),
  }));
  const current = stored.resetKey === resetKey
    ? stored
    : { resetKey, showNotReady: false, dismissedGames: new Set<string>() };

  const setShowNotReady: Dispatch<SetStateAction<boolean>> = (action) => {
    setStored((previous) => {
      const base = previous.resetKey === resetKey ? previous : current;
      return { ...base, showNotReady: resolveStateAction(action, base.showNotReady) };
    });
  };
  const setDismissedGames: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setStored((previous) => {
      const base = previous.resetKey === resetKey ? previous : current;
      return { ...base, dismissedGames: resolveStateAction(action, base.dismissedGames) };
    });
  };

  return {
    showNotReady: current.showNotReady,
    setShowNotReady,
    dismissedGames: current.dismissedGames,
    setDismissedGames,
  };
}

export function useLearningPageState({
  activeWords,
  filteredWords,
  selectedCategories,
  progress,
  isHydrated,
  minigameFrequency,
  categoryOrder,
  dueTimerRevision = 0,
  typingModeEnabled = false,
  tiltGameEnabled = false,
  progressPlanRevision = 0,
}: UseLearningPageStateOptions) {
  const [minigameSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const selectedCategoriesKey = Array.from(selectedCategories).sort().join('|');
  const categoryOrderKey = categoryOrder.join('|');
  const wordsResetKey = useMemo(() => {
    let hash = 5381;
    for (const word of filteredWords) {
      const categoryPositionSig = Object.entries(word.categoryPositions ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, position]) => `${category}:${position}`)
        .join(',');
      const signature = `${word.id}:${word.listPosition ?? ''}:${categoryPositionSig}`;
      for (let i = 0; i < signature.length; i += 1) {
        hash = ((hash << 5) + hash + signature.charCodeAt(i)) | 0;
      }
    }
    return `${filteredWords.length}:${hash}:${categoryOrderKey}`;
  }, [categoryOrderKey, filteredWords]);

  const uiResetKey = `${selectedCategoriesKey}::${wordsResetKey}`;
  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
  } = useResettableLearningUiState(uiResetKey);

  const statsWords = useMemo(
    () => getProgressStatsWords(activeWords, selectedCategories),
    [activeWords, selectedCategories]
  );

  const { dueWords, newWords, settlingWords } = useWordStream(
    filteredWords,
    progress,
    isHydrated,
    categoryOrder,
    dueTimerRevision,
  );
  const readyCount = dueWords.length;

  const learnedPool = useMemo(
    () => filteredWords.filter((word) => (progress[word.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );
  const getStageIndex = useCallback(
    (wordId: string) => progress[wordId]?.stageIndex ?? 0,
    [progress],
  );

  const { streamGroupedWords } = useLearningStreamGroups({
    dueWords,
    newWords,
    settlingWords,
    showNotReady,
    learnedPool,
    isHydrated,
    minigameFrequency,
    dismissedGames,
    minigameSeed,
    selectedCategoriesKey,
    wordsResetKey,
    // The typing quiz duplicates the main card while typing mode is on; the
    // other quizzes keep rotating between cards.
    excludeGameTypes: typingModeEnabled ? ['typing'] : [],
    includeGameTypes: tiltGameEnabled ? ['tiltChoice'] : [],
    getStageIndex,
    progressPlanRevision,
  });

  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  return {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    dueWords,
    settlingWords,
    streamGroupedWords,
    cardDeckGroups: streamGroupedWords,
    progressStats,
  };
}
