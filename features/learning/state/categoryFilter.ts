'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

function getFilterableCategories(words: NormalizedWord[]): Array<{ key: string; name: string }> {
  const byKey = new Map<string, string>();
  for (const word of words) {
    for (const category of word.category) {
      if (category === 'word' || category === 'phrase') continue;
      byKey.set(word.categoryKey ?? category, category);
    }
  }
  return Array.from(
    byKey,
    ([key, name]) => ({ key, name }),
  ).sort((left, right) => left.name.localeCompare(right.name) || left.key.localeCompare(right.key));
}

function resolveVisibleCategories(
  storedCategories: string[] | undefined,
  availableCategories: Array<{ key: string; name: string }>
): string[] {
  if (availableCategories.length === 0) return [];
  if (storedCategories === undefined) {
    return availableCategories.map((category) => category.key);
  }

  const availableSet = new Set(availableCategories.map((category) => category.key));
  const keysByLegacyName = new Map<string, string[]>();
  for (const category of availableCategories) {
    keysByLegacyName.set(category.name, [
      ...(keysByLegacyName.get(category.name) ?? []),
      category.key,
    ]);
  }
  return Array.from(
    new Set(
      normalizeCategoryValues(storedCategories).flatMap((value) =>
        availableSet.has(value) ? [value] : keysByLegacyName.get(value) ?? [],
      ),
    ),
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
  const previousAvailableByScope = useRef<
    Record<string, Array<{ key: string; name: string }>>
  >({});

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
    const previous = previousAvailableByScope.current[scopeKey];
    previousAvailableByScope.current[scopeKey] = availableCategories;
    if (!previous || previous.length === 0) return;

    const stored = selectedCategoriesByScope[scopeKey];
    const previousSelected = resolveVisibleCategories(stored, previous);
    const previouslyAllSelected = previous.every((category) =>
      previousSelected.includes(category.key),
    );
    const currentKeys = availableCategories.map((category) => category.key);
    if (
      !previouslyAllSelected ||
      currentKeys.every((key) => previousSelected.includes(key))
    ) {
      return;
    }
    setSelectedCategoriesByScope((current) => ({
      ...current,
      [scopeKey]: currentKeys,
    }));
  }, [availableCategories, scopeKey, selectedCategoriesByScope]);

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
