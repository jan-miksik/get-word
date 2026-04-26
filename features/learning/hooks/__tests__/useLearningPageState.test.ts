import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLearningPageState } from '../useLearningPageState';
import type { NormalizedWord } from '@/lib/words';

function makeWord(id: string, listId: string): NormalizedWord {
  return {
    id,
    listId,
    category: ['basics', 'word'],
    cz: `cz ${id}`,
    en: `en ${id}`,
    vi: `vi ${id}`,
  };
}

function visibleWordIds(groups: ReturnType<typeof useLearningPageState>['cardDeckGroups']) {
  return groups
    .flat()
    .filter((item): item is NormalizedWord => !('_isMinigame' in item))
    .map((word) => word.id);
}

describe('useLearningPageState', () => {
  it('regenerates the frozen card deck when the filtered word list changes', () => {
    const listA = [makeWord('a-1', 'list-a')];
    const listB = [makeWord('b-1', 'list-b')];
    const selectedCategories = new Set<string>();

    const { result, rerender } = renderHook(
      ({ filteredWords }) =>
        useLearningPageState({
          activeWords: filteredWords,
          filteredWords,
          selectedCategories,
          progress: {},
          isHydrated: true,
          viewMode: 'card',
          minigameFrequency: 'off',
        }),
      { initialProps: { filteredWords: listA } }
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['a-1']);

    rerender({ filteredWords: listB });

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['b-1']);
  });

  it('clears the frozen card deck when the selected list has no words', () => {
    const listA = [makeWord('a-1', 'list-a')];
    const selectedCategories = new Set<string>();

    const { result, rerender } = renderHook(
      ({ filteredWords }) =>
        useLearningPageState({
          activeWords: filteredWords,
          filteredWords,
          selectedCategories,
          progress: {},
          isHydrated: true,
          viewMode: 'card',
          minigameFrequency: 'off',
        }),
      { initialProps: { filteredWords: listA } }
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['a-1']);

    rerender({ filteredWords: [] });

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual([]);
  });
});
