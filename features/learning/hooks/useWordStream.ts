'use client';

import { useMemo } from 'react';
import type { ProgressData } from '@/lib/sync';
import { createWordCategoryOrderComparer, isDue, type NormalizedWord } from '@/lib/words';

export interface WordStream {
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  settlingWords: NormalizedWord[];
}

const DEFAULT_CATEGORY_ORDER: string[] = [];

/**
 * Buckets filtered words into due / new / settling streams.
 * Returns empty arrays until hydration is complete to avoid flicker.
 */
export function useWordStream(
  filteredWords: NormalizedWord[],
  progress: Record<string, ProgressData>,
  isHydrated: boolean,
  categoryOrder: string[] = DEFAULT_CATEGORY_ORDER
): WordStream {
  return useMemo(() => {
    if (!isHydrated) {
      return { dueWords: [], newWords: [], settlingWords: [] };
    }

    const compareByCategoryOrder = createWordCategoryOrderComparer(categoryOrder);
    const originalIndex = new Map(filteredWords.map((word, index) => [word.id, index]));
    const compareStable = (a: NormalizedWord, b: NormalizedWord) =>
      compareByCategoryOrder(a, b) || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    const orderedWords = [...filteredWords].sort(compareStable);
    const due: NormalizedWord[] = [];
    const newWords: NormalizedWord[] = [];
    const settling: NormalizedWord[] = [];

    orderedWords.forEach((word) => {
      const wordProgress = progress[word.id];
      if (!wordProgress || wordProgress.stageIndex === 0) {
        newWords.push(word);
      } else if (isDue(wordProgress)) {
        due.push(word);
      } else {
        settling.push(word);
      }
    });

    due.sort(
      (a, b) =>
        compareStable(a, b) ||
        (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0)
    );

    return { dueWords: due, newWords, settlingWords: settling };
  }, [filteredWords, progress, isHydrated, categoryOrder]);
}
