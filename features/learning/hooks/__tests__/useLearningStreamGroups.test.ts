import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GameType, MiniGameConfig } from '@/features/learning/minigames';
import type { NormalizedWord } from '@/lib/words';
import { useLearningStreamGroups } from '../useLearningStreamGroups';

const words: NormalizedWord[] = Array.from({ length: 16 }, (_, index) => ({
  id: `w-${index}`,
  cz: ['cat', 'bat', 'hat', 'mat'][index % 4],
  vi: `answer-${index}`,
  en: '',
  category: ['word'],
}));

function games(groups: ReturnType<typeof useLearningStreamGroups>['streamGroupedWords']) {
  return groups
    .flat()
    .filter((item): item is MiniGameConfig => '_isMinigame' in item);
}

const baseArgs = {
  priorityWords: [] as NormalizedWord[],
  dueWords: [] as NormalizedWord[],
  newWords: words,
  settlingWords: [] as NormalizedWord[],
  showNotReady: false,
  learnedPool: [] as NormalizedWord[],
  isHydrated: true,
  minigameFrequency: { min: 2, max: 2 } as const,
  dismissedGames: new Set<string>(),
  minigameSeed: 17,
  selectedCategoriesKey: '',
  wordsResetKey: 'words',
  excludeGameTypes: ['multipleChoice', 'typing', 'matching'] as GameType[],
};

describe('useLearningStreamGroups tiltChoice cache invalidation', () => {
  it('adds and removes the opt-in game immediately when the toggle changes', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useLearningStreamGroups({
          ...baseArgs,
          includeGameTypes: enabled ? ['tiltChoice'] : [],
        }),
      { initialProps: { enabled: false } },
    );
    expect(games(result.current.streamGroupedWords)).toHaveLength(0);

    rerender({ enabled: true });
    expect(games(result.current.streamGroupedWords).length).toBeGreaterThan(0);
    expect(
      games(result.current.streamGroupedWords).every((game) => game.gameType === 'tiltChoice'),
    ).toBe(true);

    rerender({ enabled: false });
    expect(games(result.current.streamGroupedWords)).toHaveLength(0);
  });

  it('invalidates once when initial progress becomes ready but not for ordinary updates', () => {
    let stage = 0;
    const getStageIndex = () => stage;
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useLearningStreamGroups({
          ...baseArgs,
          includeGameTypes: ['tiltChoice'],
          getStageIndex,
          progressPlanRevision: revision,
        }),
      { initialProps: { revision: 'pending' } },
    );
    expect(games(result.current.streamGroupedWords).every((game) => game.level === 1)).toBe(true);

    stage = 3;
    rerender({ revision: 'pending' });
    expect(games(result.current.streamGroupedWords).every((game) => game.level === 1)).toBe(true);

    rerender({ revision: 'ready' });
    expect(games(result.current.streamGroupedWords).every((game) => game.level === 2)).toBe(true);
  });
});
