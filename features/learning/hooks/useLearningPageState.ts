'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressData } from '@/lib/sync';
import { calculateProgressStats, getProgressStatsWords } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { MiniGameConfig, MinigameFrequencyRange } from '@/lib/minigames';
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
}

export function useLearningPageState({
  activeWords,
  filteredWords,
  selectedCategories,
  progress,
  isHydrated,
  viewMode,
  minigameFrequency,
}: UseLearningPageStateOptions) {
  const [showNotReady, setShowNotReady] = useState(false);
  const [dismissedGames, setDismissedGames] = useState<Set<string>>(new Set());
  const [minigameSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const frozenDeckRef = useRef<{
    key: string;
    groups: (NormalizedWord | MiniGameConfig)[][];
  } | null>(null);

  const selectedCategoriesKey = Array.from(selectedCategories).sort().join('|');
  const wordsResetKey = useMemo(() => {
    let hash = 5381;
    for (const word of filteredWords) {
      const id = word.id;
      for (let i = 0; i < id.length; i += 1) {
        hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
      }
    }
    return `${filteredWords.length}:${hash}`;
  }, [filteredWords]);

  useEffect(() => {
    setShowNotReady(false);
    setDismissedGames(new Set());
  }, [selectedCategoriesKey, wordsResetKey]);

  const statsWords = useMemo(
    () => getProgressStatsWords(activeWords, selectedCategories),
    [activeWords, selectedCategories]
  );

  const { dueWords, newWords, settlingWords } = useWordStream(filteredWords, progress, isHydrated);
  const readyCount = dueWords.length;

  const learnedPool = useMemo(
    () => filteredWords.filter((word) => (progress[word.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );

  const { resetStablePlans, streamGroupedWords } = useLearningStreamGroups({
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
  });

  useEffect(() => {
    resetStablePlans();
  }, [selectedCategoriesKey, wordsResetKey]);

  const deckResetKey = `${selectedCategoriesKey}|${wordsResetKey}|${viewMode}`;
  if (
    viewMode === 'card' &&
    (!frozenDeckRef.current || frozenDeckRef.current.key !== deckResetKey)
  ) {
    frozenDeckRef.current = { key: deckResetKey, groups: streamGroupedWords };
  }

  const cardDeckGroups = frozenDeckRef.current?.groups ?? streamGroupedWords;
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
    cardDeckGroups,
    progressStats,
  };
}
