import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLearningPageState } from '../useLearningPageState';
import type { ProgressData } from '@/features/sync/types';
import type { MiniGameConfig } from '@/features/learning/minigames';
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

/** Words already met and due again — the only stretch games are scheduled in. */
function dueReviewProgress(ids: readonly string[], now: number): Record<string, ProgressData> {
  return Object.fromEntries(ids.map((id) => [
    id,
    { stageIndex: 1, knownCount: 1, unknownCount: 0, lastKnownAt: now - 120_000, nextDueAt: now - 60_000 },
  ]));
}

function visibleItems(groups: ReturnType<typeof useLearningPageState>['streamGroupedWords']) {
  return groups
    .flat()
    .map((item) => '_isMinigame' in item ? `game:${item.anchorOriginalIndex}` : item.id);
}

const cappingGoal = {
  id: 'goal-1', effectiveFromDay: '2026-08-20', enabled: true, mode: 'words' as const, daysPerWeek: 5, weekdays: null,
  minutesPerDay: 10, wordsPerDay: 4, newWordsPerDay: null, preset: 'medium' as const,
  pacing: { revealMode: 'press' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } },
};

describe('useLearningPageState', () => {
  // Before the day's plan resolves — and for anyone studying without a goal —
  // the stream is bucketed here rather than by `planSession`. A pinned or
  // personal word the learner has never met leads the stream, but it is still
  // a new word: handing the whole priority bucket to the opening review block
  // put brand-new words under a rail labelled "review", on the very first card
  // of the session, and left them out of the new-word block entirely.
  it('keeps an unseen personal word out of the opening review block', () => {
    const now = Date.now();
    const personal = [makeWord('mine-0', 'list-mine'), makeWord('mine-1', 'list-mine')];
    const due = [makeWord('due-0', 'list-shared'), makeWord('due-1', 'list-shared')];

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: [...personal, ...due],
        selectedCategories: new Set<string>(),
        progress: dueReviewProgress(due.map((word) => word.id), now),
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
        ownedPersonalListIds: new Set(['list-mine']),
        studyGoal: null,
        isSessionDataReady: true,
      })
    );

    expect(result.current.streamGroups.map((group) => group.kind)).toEqual(['review', 'new']);
    expect(result.current.streamGroups[0].items.map((item) => 'id' in item && item.id))
      .toEqual(['due-0', 'due-1']);
    expect(result.current.streamGroups[1].items.map((item) => 'id' in item && item.id))
      .toEqual(['mine-0', 'mine-1']);
  });

  it('opens a minigame-free reinforcement block only after its new words were introduced', () => {
    const now = Date.now();
    const words = Array.from({ length: 5 }, (_, index) =>
      makeWord(`new-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result, rerender } = renderHook(({ progress }) =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress,
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: { min: 2, max: 2 },
        categoryOrder: [],
        studyGoal: { ...cappingGoal, wordsPerDay: 5, newWordsPerDay: 5 },
        isSessionDataReady: true,
        dayTargets: { resolvedNewTarget: 5, resolvedReviewTarget: 0, resolvedItemBudget: 17 },
      }), { initialProps: { progress: {} as Record<string, ProgressData> } }
    );

    expect(result.current.streamGroups).toHaveLength(1);
    expect(result.current.streamGroups[0]).toMatchObject({ kind: 'new' });
    const introduced = Object.fromEntries(words.map((entry) => [entry.id, {
      stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: now,
      lastKnownAt: now, nextDueAt: now + 5 * 60_000,
    }])) as Record<string, ProgressData>;
    rerender({ progress: introduced });
    expect(result.current.streamGroups[0]).toMatchObject({
      kind: 'review',
      reinforcement: true,
    });
    expect(result.current.streamGroups[0].items).toEqual(words);
  });

  it('ends a new-only day after reinforcement even when the last answers are due again', () => {
    const now = Date.now();
    const words = Array.from({ length: 7 }, (_, index) =>
      makeWord(`new-${index}`, 'list-a', 'basics', 0, index)
    );
    const initialProgress = {} as Record<string, ProgressData>;
    const afterFirstPass = Object.fromEntries(words.map((word) => [
      word.id,
      {
        stageIndex: 1, knownCount: 1, unknownCount: 0, introducedAt: now,
        lastKnownAt: now, nextDueAt: now + 5 * 60_000,
      },
    ])) as Record<string, ProgressData>;
    // A forgotten reinforcement answer is immediately due again. It belongs to
    // the future SRS stream, not to either block of the day just completed.
    const afterReinforcement = Object.fromEntries(words.map((word) => [
      word.id,
      {
        stageIndex: 0, knownCount: 1, unknownCount: 1, introducedAt: now,
        lastKnownAt: now, lastUnknownAt: now, nextDueAt: now - 1,
      },
    ])) as Record<string, ProgressData>;

    const { result, rerender } = renderHook(
      ({ progress }) => useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress,
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
        studyGoal: { ...cappingGoal, wordsPerDay: 7, newWordsPerDay: 7 },
        isSessionDataReady: true,
        dayTargets: { resolvedNewTarget: 7, resolvedReviewTarget: 0, resolvedItemBudget: 7 },
      }),
      { initialProps: { progress: initialProgress } },
    );

    expect(result.current.streamGroups.map((group) => group.kind)).toEqual(['new']);
    rerender({ progress: afterFirstPass });
    expect(result.current.streamGroups.map((group) => group.kind)).toEqual(['review']);
    rerender({ progress: afterReinforcement });
    expect(result.current.streamGroups).toEqual([]);
  });

  it('counts every due repeat, not only the ones today\'s plan took', () => {
    const words = Array.from({ length: 9 }, (_, index) => makeWord(`due-${index}`, 'list-a'));
    const overdue = Date.now() - 60_000;
    const progress = Object.fromEntries(
      words.map((word) => [
        word.id,
        { stageIndex: 3, nextDueAt: overdue, knownCount: 1, unknownCount: 0 } as unknown as ProgressData,
      ]),
    );

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress,
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
        studyGoal: cappingGoal,
        isSessionDataReady: true,
        dayTargets: { resolvedNewTarget: 0, resolvedReviewTarget: 3, resolvedItemBudget: 3 },
      })
    );

    // The plan takes three; the other six are still due this minute, which is
    // what the Upcoming panel lists and what the closing card must not deny.
    expect(result.current.dueWords).toHaveLength(3);
    expect(result.current.dueNowCount).toBe(9);
  });

  it('regenerates the frozen card deck when the filtered word list changes', () => {
    const listA = [makeWord('a-1', 'list-a')];
    const listB = [makeWord('b-1', 'list-b')];
    const selectedCategories = new Set<string>();

    const { result, rerender } = renderHook(
      ({ filteredWords }) =>
        useLearningPageState({
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

  it('orders same-named categories independently by their namespaced keys', () => {
    const first = {
      ...makeWord('first', 'list-a', 'basics', 0, 0),
      categoryKey: 'list-a:category-a',
    };
    const second = {
      ...makeWord('second', 'list-b', 'basics', 0, 0),
      categoryKey: 'list-b:category-b',
    };

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: [first, second],
        selectedCategories: new Set<string>(),
        progress: {},
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: ['list-b:category-b', 'list-a:category-a'],
      })
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual([
      'second',
      'first',
    ]);
  });

  it('promotes a card when it becomes due in the background', () => {
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

  it('recalculates due cards on a timer tick without a new progress object', () => {
    const now = Date.now();
    const words = [makeWord('review-1', 'list-a'), makeWord('new-1', 'list-a')];
    const progress: Record<string, ProgressData> = {
      'review-1': {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        nextDueAt: now + 60_000,
      },
    };

    const { result, rerender } = renderHook(
      ({ dueTimerRevision }) =>
        useLearningPageState({
          filteredWords: words,
          selectedCategories: new Set<string>(),
          progress,
          isHydrated: true,
          viewMode: 'card',
          minigameFrequency: 'off',
          categoryOrder: [],
          dueTimerRevision,
        }),
      { initialProps: { dueTimerRevision: 0 } },
    );

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['new-1']);

    progress['review-1'].nextDueAt = now - 1;
    rerender({ dueTimerRevision: 1 });

    expect(visibleWordIds(result.current.cardDeckGroups)).toEqual(['review-1', 'new-1']);
  });

  it('keeps an early pending minigame available as fresh-user cards are learned on the go', () => {
    const now = Date.now();
    const words = Array.from({ length: 6 }, (_, index) =>
      makeWord(`rev-${index}`, 'list-a', 'basics', 0, index)
    );
    const selectedCategories = new Set<string>();
    const dueProgress = dueReviewProgress(words.map((word) => word.id), now);
    const learnedProgress: Record<string, ProgressData> = {
      ...dueProgress,
      'rev-0': { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: now, nextDueAt: now + 60_000 },
      'rev-1': { stageIndex: 2, knownCount: 2, unknownCount: 0, lastKnownAt: now, nextDueAt: now + 60_000 },
    };

    const { result, rerender } = renderHook(
      ({ progress }) =>
        useLearningPageState({
          filteredWords: words,
          selectedCategories,
          progress,
          isHydrated: true,
          viewMode: 'stream',
          minigameFrequency: { min: 2, max: 2 },
          categoryOrder: [],
        }),
      { initialProps: { progress: dueProgress } }
    );

    const initialGame = result.current.streamGroupedWords
      .flat()
      .find((item): item is MiniGameConfig => '_isMinigame' in item);
    expect(initialGame?.anchorOriginalIndex).toBe(1);

    rerender({ progress: learnedProgress });

    expect(visibleItems(result.current.streamGroupedWords).slice(0, 3)).toEqual([
      'game:1',
      'rev-2',
      'rev-3',
    ]);
  });

  it('keeps minigames available through a larger review card session', () => {
    const now = Date.now();
    const words = Array.from({ length: 10 }, (_, index) =>
      makeWord(`rev-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: dueReviewProgress(words.map((word) => word.id), now),
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: { min: 2, max: 2 },
        categoryOrder: [],
      })
    );

    const gameAnchors = result.current.cardDeckGroups
      .flat()
      .filter((item): item is MiniGameConfig => '_isMinigame' in item)
      .map((item) => item.anchorOriginalIndex);

    // Every two cards gets an interlude while another word remains behind it.
    // A derived game after the final live word could not survive that word's
    // commit, so it is deliberately not offered as an unreachable last card.
    expect(gameAnchors).toEqual([1, 3, 5, 7]);
    expect(result.current.streamGroups[0].items.at(-1)).toMatchObject({ id: 'rev-9' });
  });

  it('schedules matching and bubble-review interludes between cards', () => {
    // Choice and typing are study cards. Matching remains practice-only while
    // the bubble game attributes its individual answers back to SR.
    const now = Date.now();
    const words = Array.from({ length: 60 }, (_, index) =>
      makeWord(`rev-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: dueReviewProgress(words.map((word) => word.id), now),
        isHydrated: true,
        viewMode: 'stream',
        minigameFrequency: { min: 2, max: 2 },
        categoryOrder: [],
      })
    );

    const games = result.current.streamGroupedWords
      .flat()
      .filter((item): item is MiniGameConfig => '_isMinigame' in item);

    expect(games.length).toBeGreaterThan(0);
    expect(games.every((game) => ['matching', 'bubbleChoice', 'similarWordsPrompt'].includes(game.gameType))).toBe(true);
    expect(games.some((game) => game.gameType === 'bubbleChoice')).toBe(true);
  });


  it('adds tiltChoice to the bubble-review rotation while its frontier toggle is enabled', () => {
    const now = Date.now();
    const words = Array.from({ length: 60 }, (_, index) =>
      makeWord(`rev-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result, rerender } = renderHook(
      ({ tiltGameEnabled }) =>
        useLearningPageState({
          filteredWords: words,
          selectedCategories: new Set<string>(),
          progress: dueReviewProgress(words.map((word) => word.id), now),
          isHydrated: true,
          viewMode: 'stream',
          minigameFrequency: { min: 2, max: 2 },
          categoryOrder: [],
          tiltGameEnabled,
        }),
      { initialProps: { tiltGameEnabled: false } },
    );

    const gamesOf = (groups: ReturnType<typeof useLearningPageState>['streamGroupedWords']) =>
      groups.flat().filter((item): item is MiniGameConfig => '_isMinigame' in item);

    expect(gamesOf(result.current.streamGroupedWords).some((game) => game.gameType === 'bubbleChoice'))
      .toBe(true);

    rerender({ tiltGameEnabled: true });

    const tiltAndBubbleGames = gamesOf(result.current.streamGroupedWords);
    expect(tiltAndBubbleGames.length).toBeGreaterThan(0);
    expect(tiltAndBubbleGames.every((game) => ['tiltChoice', 'bubbleChoice', 'similarWordsPrompt'].includes(game.gameType))).toBe(true);
    expect(tiltAndBubbleGames.some((game) => game.gameType === 'tiltChoice')).toBe(true);
  });
  it('schedules no minigame at all in a block of new words', () => {
    // A bubble field grades every word it holds, so a round scheduled among new
    // words introduced them without the learner ever meeting the card — and
    // answered, off-screen, the repeats the day was planning to ask about.
    // Matching has no stage-zero variant, which left bubbles as the *only*
    // candidate there: the mixing was reliable rather than occasional.
    const words = Array.from({ length: 30 }, (_, index) =>
      makeWord(`new-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: {},
        isHydrated: true,
        viewMode: 'stream',
        minigameFrequency: { min: 2, max: 2 },
        categoryOrder: [],
      })
    );

    const newBlockGames = result.current.streamGroups
      .filter((group) => group.kind === 'new')
      .flatMap((group) => group.items)
      .filter((item) => '_isMinigame' in item);
    expect(newBlockGames).toEqual([]);
  });

  it('opens only one ten-word review round past the daily goal', () => {
    const now = Date.now();
    const words = Array.from({ length: 24 }, (_, index) =>
      makeWord(`rev-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result } = renderHook(() =>
      useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress: dueReviewProgress(words.map((word) => word.id), now),
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
        continueAnyway: true,
      })
    );

    expect(result.current.dueNowCount).toBe(10);
    expect(result.current.newNowCount).toBe(0);
    expect(result.current.bonusBlockProgress.map((block) => block.total)).toEqual([10]);
    expect(result.current.streamGroups.map((group) => group.key)).toEqual(['bonus-review-0']);
    expect(result.current.streamGroups.map((group) => group.items.length)).toEqual([10]);
  });

  it('caps a new-word bonus at ten and immediately reinforces the same words', () => {
    const now = Date.now();
    const words = Array.from({ length: 24 }, (_, index) =>
      makeWord(`new-${index}`, 'list-a', 'basics', 0, index)
    );

    const { result, rerender } = renderHook(
      ({ progress }) => useLearningPageState({
        filteredWords: words,
        selectedCategories: new Set<string>(),
        progress,
        isHydrated: true,
        viewMode: 'card',
        minigameFrequency: 'off',
        categoryOrder: [],
        continueAnyway: true,
      }),
      { initialProps: { progress: {} as Record<string, ProgressData> } },
    );

    expect(result.current.newNowCount).toBe(10);
    expect(result.current.bonusBlockProgress.map((block) => ({
      kind: block.kind,
      total: block.total,
      reinforcement: block.reinforcement ?? false,
    }))).toEqual([
      { kind: 'new', total: 10, reinforcement: false },
      { kind: 'review', total: 10, reinforcement: true },
    ]);
    expect(result.current.streamGroups).toHaveLength(1);
    expect(result.current.streamGroups[0]).toMatchObject({ kind: 'new' });

    const afterFirstPass = Object.fromEntries(words.slice(0, 10).map((word) => [
      word.id,
      {
        stageIndex: 1,
        knownCount: 1,
        unknownCount: 0,
        introducedAt: now,
        lastKnownAt: now,
        nextDueAt: now + 5 * 60_000,
      },
    ])) as Record<string, ProgressData>;
    rerender({ progress: afterFirstPass });

    expect(result.current.streamGroups).toHaveLength(1);
    expect(result.current.streamGroups[0]).toMatchObject({
      kind: 'review',
      reinforcement: true,
      items: words.slice(0, 10),
    });
  });
});
