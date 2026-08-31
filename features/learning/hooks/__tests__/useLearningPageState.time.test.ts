import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProgressData } from '@/features/sync/types';
import type { NormalizedWord } from '@/lib/words';

const clock = vi.hoisted(() => ({ phase: 0 }));
vi.mock('@/features/learning/session/useTimePhase', () => ({
  useTimePhase: () => clock.phase,
}));

import { useLearningPageState } from '../useLearningPageState';

const goal = {
  id: 'minutes-goal', effectiveFromDay: '2026-08-29', enabled: true, mode: 'minutes' as const,
  daysPerWeek: 5, weekdays: null, minutesPerDay: 10, wordsPerDay: 5, newWordsPerDay: null,
  preset: 'medium' as const,
  pacing: { revealMode: 'press' as const, minigameFrequency: 'off' as const, fineTune: { version: 3 as const, stages: [] } },
};

const words: NormalizedWord[] = Array.from({ length: 6 }, (_, index) => ({
  id: `new-${index}`,
  listId: 'list-a',
  category: ['basics'],
  cz: `cz ${index}`,
  en: `en ${index}`,
  vi: `vi ${index}`,
}));

function options(progress: Record<string, ProgressData>, pendingAnswers: Record<string, number> = {}) {
  return {
    filteredWords: words,
    selectedCategories: new Set<string>(),
    progress,
    isHydrated: true,
    viewMode: 'card' as const,
    minigameFrequency: 'off' as const,
    categoryOrder: [],
    studyGoal: goal,
    isSessionDataReady: true,
    pendingAnswers,
    timeGoal: {
      dayKey: '2026-08-29',
      timezone: 'UTC',
      budgetMs: 10 * 60_000,
      serverActiveMs: 0,
    },
  };
}

function visibleIds(result: ReturnType<typeof useLearningPageState>) {
  return result.streamGroups.flatMap((group) => group.items)
    .filter((item): item is NormalizedWord => !('_isMinigame' in item))
    .map((word) => word.id);
}

describe('useLearningPageState minutes journey', () => {
  beforeEach(() => {
    localStorage.clear();
    clock.phase = 0;
    vi.setSystemTime(Date.parse('2026-08-29T10:00:00Z'));
  });

  it('stays on live new words until the clock opens a held reinforcement phase', () => {
    const { result, rerender } = renderHook(
      ({ progress, pendingAnswers }) => useLearningPageState(options(progress, pendingAnswers)),
      { initialProps: { progress: {} as Record<string, ProgressData>, pendingAnswers: {} } },
    );

    // The compatibility five-item plan used to expose only two of these.
    expect(visibleIds(result.current)).toEqual(words.map((word) => word.id));
    expect(result.current.timePhaseEmptyKind).toBeNull();

    const introduced = Object.fromEntries(words.map((word) => [word.id, {
      stageIndex: 1,
      knownCount: 1,
      unknownCount: 0,
      introducedAt: Date.parse('2026-08-29T10:01:00Z'),
      lastKnownAt: Date.parse('2026-08-29T10:01:00Z'),
      nextDueAt: Date.parse('2026-08-29T10:06:00Z'),
    }])) as Record<string, ProgressData>;

    clock.phase = 1;
    rerender({ progress: introduced, pendingAnswers: {} });
    expect(result.current.timeTransition).not.toBeNull();

    act(() => result.current.timeTransition?.dismiss());
    expect(result.current.timeTransition).toBeNull();
    expect(result.current.streamGroups[0]).toMatchObject({ kind: 'review', reinforcement: true });
    expect(visibleIds(result.current)).toEqual(words.map((word) => word.id));

    rerender({ progress: introduced, pendingAnswers: { 'new-0': 1 } });
    expect(visibleIds(result.current)).toEqual(words.slice(1).map((word) => word.id));
  });
});
