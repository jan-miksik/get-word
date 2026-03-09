'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchesCategoryFilter } from '@/lib/words';
import { debouncedSync } from '@/lib/sync';

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
  }, [selectedCategories, isHydrated]);

  const applyServerCategories = useCallback((categories: string[]) => {
    setSelectedCategories(new Set(categories));
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const filteredWords = useMemo(
    () => words.filter((word) => matchesCategoryFilter(word, selectedCategories)),
    [words, selectedCategories]
  );

  return { selectedCategories, toggleCategory, filteredWords, applyServerCategories };
}
