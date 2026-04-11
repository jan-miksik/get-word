'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWordStream } from '@/features/learning/hooks/useWordStream';
import { getProgressStatsWords, calculateProgressStats } from '@/lib/progress-stats';
import { STAGES, type NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';

interface UseEditPageStateOptions {
  normalizedWords: NormalizedWord[];
  filteredWords: NormalizedWord[];
  selectedCategories: Set<string>;
  progress: Record<string, ProgressData>;
  isHydrated: boolean;
}

export function useEditPageState({
  normalizedWords,
  filteredWords,
  selectedCategories,
  progress,
  isHydrated,
}: UseEditPageStateOptions) {
  const [showNotReady, setShowNotReady] = useState(false);

  useEffect(() => {
    setShowNotReady(false);
  }, [selectedCategories]);

  const { dueWords, newWords, settlingWords } = useWordStream(filteredWords, progress, isHydrated);
  const readyCount = dueWords.length;

  const streamGroupedWords = useMemo((): NormalizedWord[][] => {
    const groups: NormalizedWord[][] = STAGES.map(() => []);
    groups[0] = dueWords;
    groups[1] = newWords;
    if (showNotReady) {
      settlingWords.forEach((word) => {
        const stageIndex = Math.max(2, Math.min(progress[word.id]?.stageIndex ?? 2, STAGES.length - 1));
        groups[stageIndex].push(word);
      });
    }
    return groups;
  }, [dueWords, newWords, settlingWords, showNotReady, progress]);

  const statsWords = useMemo(
    () => getProgressStatsWords(normalizedWords, selectedCategories),
    [normalizedWords, selectedCategories]
  );

  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  return {
    showNotReady,
    setShowNotReady,
    readyCount,
    newWords,
    settlingWords,
    streamGroupedWords,
    progressStats,
  };
}
