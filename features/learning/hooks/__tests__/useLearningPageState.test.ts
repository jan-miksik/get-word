import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLearningPageState } from '../useLearningPageState';
import type { ProgressData } from '@/lib/sync';
import type { MiniGameConfig } from '@/lib/minigames';
import type { NormalizedWord } from '@/lib/words';

function makeWord(
  id: string,
  listId: string,
  category = 'basics',
  categoryPosition?: number,
  listPosition?: number
): NormalizedWord {
  return {
    id,
    listId,
    category: [category, 'word'],
    categoryPositions:
      categoryPosition === undefined ? undefined : { [category]: categoryPosition },
    listPosition,
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

function visibleItems(groups: ReturnType<typeof useLearningPageState>['streamGroupedWords']) {
  return groups
    .flat()
    .map((item) => '_isMinigame' in item ? `game:${item.anchorOriginalIndex}` : item.id);
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
          categoryOrder: [],
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
          categoryOrder: [],
        }),
      { initialProps: { filteredWords: listA } }
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['a-1']);

    rerender({ filteredWords: [] });

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual([]);
  });

  it('orders visible new words by editor category position by default', () => {
    const words = [
      makeWord('food-1', 'list-a', 'jídlo', 1, 0),
      makeWord('intro-1', 'list-a', 'seznámení', 0, 0),
      makeWord('food-2', 'list-a', 'jídlo', 1, 1),
      makeWord('intro-2', 'list-a', 'seznámení', 0, 1),
    ];

    const { result } = renderHook(() =>
      useLearningPageState({
        activeWords: words,
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: {},
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
      })
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual([
      'intro-1',
      'intro-2',
      'food-1',
      'food-2',
    ]);
  });

  it('lets the user category order override the editor default order', () => {
    const words = [
      makeWord('intro-1', 'list-a', 'seznámení', 0, 0),
      makeWord('food-1', 'list-a', 'jídlo', 1, 0),
    ];

    const { result } = renderHook(() =>
      useLearningPageState({
        activeWords: words,
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: {},
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: ['jídlo', 'seznámení'],
      })
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual([
      'food-1',
      'intro-1',
    ]);
  });

  it('refreshes the frozen card deck when a repeat card becomes due', () => {
    const now = Date.now();
    const words = [
      makeWord('review-1', 'list-a'),
      makeWord('new-1', 'list-a'),
    ];
    const selectedCategories = new Set<string>();
    const settlingProgress: Record<string, ProgressData> = {
      'review-1': {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: now + 60_000,
      },
    };
    const dueProgress: Record<string, ProgressData> = {
      'review-1': {
        ...settlingProgress['review-1'],
        nextDueAt: now - 1,
      },
    };

    const { result, rerender } = renderHook(
      ({ progress }) =>
        useLearningPageState({
          activeWords: words,
          filteredWords: words,
          selectedCategories,
          progress,
          isHydrated: true,
          viewMode: 'card',
          minigameFrequency: 'off',
          categoryOrder: [],
        }),
      { initialProps: { progress: settlingProgress } }
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['new-1']);

    rerender({ progress: dueProgress });

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['review-1', 'new-1']);
  });

  it('keeps an early pending minigame available as fresh-user cards are learned on the go', () => {
    const now = Date.now();
    const words = Array.from({ length: 6 }, (_, index) =>
      makeWord(`new-${index}`, 'list-a', 'basics', 0, index)
    );
    const selectedCategories = new Set<string>();
    const learnedProgress: Record<string, ProgressData> = {
      'new-0': {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: now + 60_000,
      },
      'new-1': {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: now + 60_000,
      },
    };

    const { result, rerender } = renderHook(
      ({ progress }) =>
        useLearningPageState({
          activeWords: words,
          filteredWords: words,
          selectedCategories,
          progress,
          isHydrated: true,
          viewMode: 'stream',
          minigameFrequency: { min: 2, max: 2 },
          categoryOrder: [],
        }),
      { initialProps: { progress: {} as Record<string, ProgressData> } }
    );

    const initialGame = result.current.streamGroupedWords
      .flat()
      .find((item): item is MiniGameConfig => '_isMinigame' in item);
    expect(initialGame?.anchorOriginalIndex).toBe(1);

    rerender({ progress: learnedProgress });

    expect(visibleItems(result.current.streamGroupedWords).slice(0, 3)).toEqual([
      'game:1',
      'new-2',
      'new-3',
    ]);
  });
});
