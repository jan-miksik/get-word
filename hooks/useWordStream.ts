'use client';

import { useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import type { ProgressData } from '@/lib/sync';
import { isDue } from '@/lib/words';

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
    const newW: NormalizedWord[] = [];
    const settling: NormalizedWord[] = [];

    filteredWords.forEach((word) => {
      const prog = progress[word.id];
      if (!prog || prog.stageIndex === 0) {
        newW.push(word);
      } else if (isDue(prog)) {
        due.push(word);
      } else {
        settling.push(word);
      }
    });

    // Most overdue first
    due.sort((a, b) => (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0));

    return { dueWords: due, newWords: newW, settlingWords: settling };
  }, [filteredWords, progress, isHydrated]);
}
