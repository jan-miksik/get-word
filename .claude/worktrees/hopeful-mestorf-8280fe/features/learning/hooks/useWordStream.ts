'use client';

import { useMemo } from 'react';
import type { ProgressData } from '@/lib/sync';
import { isDue, type NormalizedWord } from '@/lib/words';

export interface WordStream {
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  settlingWords: NormalizedWord[];
}

/**
 * Buckets filtered words into due / new / settling streams.
 * Returns empty arrays until hydration is complete to avoid flicker.
 */
export function useWordStream(
  filteredWords: NormalizedWord[],
  progress: Record<string, ProgressData>,
  isHydrated: boolean
): WordStream {
  return useMemo(() => {
    if (!isHydrated) {
      return { dueWords: [], newWords: [], settlingWords: [] };
    }

    const due: NormalizedWord[] = [];
    const newWords: NormalizedWord[] = [];
    const settling: NormalizedWord[] = [];

    filteredWords.forEach((word) => {
      const wordProgress = progress[word.id];
      if (!wordProgress || wordProgress.stageIndex === 0) {
        newWords.push(word);
      } else if (isDue(wordProgress)) {
        due.push(word);
      } else {
        settling.push(word);
      }
    });

    due.sort((a, b) => (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0));

    return { dueWords: due, newWords, settlingWords: settling };
  }, [filteredWords, progress, isHydrated]);
}
