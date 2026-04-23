'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchesCategoryFilter } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';

export function useCategoryFilter(
  words: NormalizedWord[],
  isHydrated: boolean,
  isUpdatingFromServerRef: React.MutableRefObject<boolean>
) {
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isHydrated || isUpdatingFromServerRef.current) return;
    debouncedSync({ category_filters: Array.from(selectedCategories) }).catch((e) =>
      console.error('[useCategoryFilter] sync:', e)
    );
  }, [selectedCategories, isHydrated, isUpdatingFromServerRef]);

  const applyServerCategories = useCallback((categories: string[]) => {
    setSelectedCategories(new Set(categories));
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      postTabMessage({
        type: 'category_filters_changed',
        categories: Array.from(next),
      });
      return next;
    });
  }, []);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'category_filters_changed') return;
      setSelectedCategories(new Set(message.categories));
    });
  }, []);

  const filteredWords = useMemo(
    () => words.filter((word) => matchesCategoryFilter(word, selectedCategories)),
    [words, selectedCategories]
  );

  return { selectedCategories, toggleCategory, filteredWords, applyServerCategories };
}
