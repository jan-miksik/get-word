'use client';

import { useMemo } from 'react';
import type { ProgressData } from '@/features/sync/types';
import {
  createPriorityPredicate,
  createWordCategoryOrderComparer,
  isDue,
  type NormalizedWord,
} from '@/lib/words';

export interface WordStream {
  /**
   * Words from the learner's own personal lists or pinned categories, served
   * before everything else — including due repeats. See
   * `createPriorityPredicate` in lib/words.ts for why, and for the one place
   * to change it.
   */
  priorityWords: NormalizedWord[];
  /**
   * How many of `priorityWords` are actual repeats (studied at least once and
   * due again). The rest are words the learner has never seen: they lead the
   * stream, but they are not reviews, and counting them as such made a fresh
   * batch from the word chat look like a pile of overdue work.
   */
  priorityDueCount: number;
  dueWords: NormalizedWord[];
  newWords: NormalizedWord[];
  settlingWords: NormalizedWord[];
}

const DEFAULT_CATEGORY_ORDER: string[] = [];
const DEFAULT_PINNED_CATEGORY_IDS: string[] = [];
const DEFAULT_OWNED_PERSONAL_LIST_IDS = new Set<string>();

/**
 * Buckets filtered words into priority / due / new / settling streams.
 * Returns empty arrays until hydration is complete to avoid flicker.
 */
export function useWordStream(
  filteredWords: NormalizedWord[],
  progress: Record<string, ProgressData>,
  isHydrated: boolean,
  categoryOrder: string[] = DEFAULT_CATEGORY_ORDER,
  dueTimerRevision = 0,
  pinnedCategoryIds: string[] = DEFAULT_PINNED_CATEGORY_IDS,
  ownedPersonalListIds: ReadonlySet<string> = DEFAULT_OWNED_PERSONAL_LIST_IDS,
): WordStream {
  // Key by value so a fresh array identity per render doesn't rebucket.
  const pinnedKey = pinnedCategoryIds.join(',');
  const ownedPersonalListIdsKey = Array.from(ownedPersonalListIds).sort().join(',');

  return useMemo(() => {
    // The revision intentionally invalidates this time-sensitive bucketing even
    // when the word/progress object identities are unchanged.
    void dueTimerRevision;
    if (!isHydrated) {
      return {
        priorityWords: [],
        priorityDueCount: 0,
        dueWords: [],
        newWords: [],
        settlingWords: [],
      };
    }

    const compareByCategoryOrder = createWordCategoryOrderComparer(categoryOrder);
    const originalIndex = new Map(filteredWords.map((word, index) => [word.id, index]));
    const compareStable = (a: NormalizedWord, b: NormalizedWord) =>
      compareByCategoryOrder(a, b) || (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    const orderedWords = [...filteredWords].sort(compareStable);
    const isPriority = createPriorityPredicate(
      pinnedKey ? pinnedKey.split(',') : [],
      new Set(ownedPersonalListIdsKey ? ownedPersonalListIdsKey.split(',') : []),
    );
    const priorityDue: NormalizedWord[] = [];
    const priorityNew: NormalizedWord[] = [];
    const due: NormalizedWord[] = [];
    const newWords: NormalizedWord[] = [];
    const settling: NormalizedWord[] = [];

    orderedWords.forEach((word) => {
      const wordProgress = progress[word.id];
      const isNew = !wordProgress || wordProgress.stageIndex === 0;
      const priority = isPriority(word);

      if (isNew) {
        (priority ? priorityNew : newWords).push(word);
      } else if (isDue(wordProgress)) {
        (priority ? priorityDue : due).push(word);
      } else {
        // A settling word is not overdue and has nothing to prove; leave it to
        // its normal schedule even when its category is pinned.
        settling.push(word);
      }
    });

    const byDueDate = (a: NormalizedWord, b: NormalizedWord) =>
      compareStable(a, b) ||
      (progress[a.id]?.nextDueAt ?? 0) - (progress[b.id]?.nextDueAt ?? 0);

    due.sort(byDueDate);
    priorityDue.sort(byDueDate);

    return {
      // Within the learner's own words, something already due comes before
      // something never seen — the pin decides ordering against OTHER words,
      // not against the learner's own memory.
      priorityWords: [...priorityDue, ...priorityNew],
      priorityDueCount: priorityDue.length,
      dueWords: due,
      newWords,
      settlingWords: settling,
    };
  }, [
    filteredWords,
    progress,
    isHydrated,
    categoryOrder,
    dueTimerRevision,
    pinnedKey,
    ownedPersonalListIdsKey,
  ]);
}
