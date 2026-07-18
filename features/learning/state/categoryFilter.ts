'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { NormalizedWord } from '@/lib/words';
import { matchesCategoryFilter } from '@/lib/words';
import { postTabMessage, subscribeTabMessages } from '@/lib/tab-sync';
import {
  persistCategoryFiltersByList,
  readStoredCategoryFiltersByList,
} from '@/features/learning/app-state/storage';

function normalizeCategoryValues(value: Iterable<unknown>): string[] {
  return Array.from(
    new Set(
      Array.from(value)
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );
}

function createCategorySet(value: Iterable<unknown>): Set<string> {
  return new Set(normalizeCategoryValues(value));
}

function areCategoryArraysEqual(left: string[] | undefined, right: string[]): boolean {
  if (!left) return right.length === 0;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function getFilterableCategories(words: NormalizedWord[]): string[] {
  return Array.from(
    new Set(
      words.flatMap((word) =>
        word.category.filter((category) => category !== 'word' && category !== 'phrase')
      )
    )
  ).sort((left, right) => left.localeCompare(right));
}

function resolveVisibleCategories(
  storedCategories: string[] | undefined,
  availableCategories: string[]
): string[] {
  if (availableCategories.length === 0) return [];
  if (storedCategories === undefined) {
    return availableCategories;
  }

  const availableSet = new Set(availableCategories);
  return normalizeCategoryValues(storedCategories).filter((category) =>
    availableSet.has(category)
  );
}

export function useCategoryFilter(
  words: NormalizedWord[],
  _isHydrated: boolean,
  _isUpdatingFromServerRef: React.MutableRefObject<boolean>,
  scopeKey: string
) {
  const [selectedCategoriesByScope, setSelectedCategoriesByScope] = useState<Record<string, string[]>>(
    () => readStoredCategoryFiltersByList()
  );

  const availableCategories = useMemo(() => getFilterableCategories(words), [words]);
  const selectedCategoryValues = useMemo(
    () => resolveVisibleCategories(selectedCategoriesByScope[scopeKey], availableCategories),
    [availableCategories, scopeKey, selectedCategoriesByScope]
  );
  const selectedCategories = useMemo(
    () => createCategorySet(selectedCategoryValues),
    [selectedCategoryValues]
  );

  useEffect(() => {
    persistCategoryFiltersByList(selectedCategoriesByScope);
  }, [selectedCategoriesByScope]);

  const applyServerCategories = useCallback((categories: string[]) => {
    // Category visibility is list-scoped client UI state. The current server payload
    // stores only flat category names, which cannot safely distinguish same-named
    // categories across different lists.
    void categories;
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategoriesByScope((prev) => {
      const nextCurrent = selectedCategoryValues.includes(category)
        ? selectedCategoryValues.filter((value) => value !== category)
        : [...selectedCategoryValues, category].sort((left, right) => left.localeCompare(right));
      if (areCategoryArraysEqual(prev[scopeKey], nextCurrent)) {
        return prev;
      }
      const next = { ...prev, [scopeKey]: nextCurrent };
      postTabMessage({
        type: 'category_filters_changed',
        scopeKey,
        categories: nextCurrent,
      });
      return next;
    });
  }, [scopeKey, selectedCategoryValues]);

  useEffect(() => {
    return subscribeTabMessages((message) => {
      if (message.type !== 'category_filters_changed') return;
      if (message.scopeKey !== scopeKey) return;
      const nextCategories = normalizeCategoryValues(message.categories);
      setSelectedCategoriesByScope((prev) =>
        areCategoryArraysEqual(prev[scopeKey], nextCategories)
          ? prev
          : { ...prev, [scopeKey]: nextCategories }
      );
    });
  }, [scopeKey]);

  const filteredWords = useMemo(
    () => words.filter((word) => matchesCategoryFilter(word, selectedCategories)),
    [words, selectedCategories]
  );

  return { selectedCategories, toggleCategory, filteredWords, applyServerCategories };
}
