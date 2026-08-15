'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ProgressData } from '@/features/sync/contracts';
import { calculateProgressStats } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import { useLearningStreamGroups } from './useLearningStreamGroups';
import { useWordStream } from './useWordStream';
import type { ViewMode } from '../app-state/types';

interface UseLearningPageStateOptions {
  activeWords: NormalizedWord[];
  filteredWords: NormalizedWord[];
  selectedCategories: Set<string>;
  progress: Record<string, ProgressData>;
  isHydrated: boolean;
  viewMode: ViewMode;
  minigameFrequency: MinigameFrequencyRange;
  categoryOrder: string[];
  /** Categories whose words lead the stream; server-owned, see lib/words.ts. */
  pinnedCategoryIds?: string[];
  /** The learner's personal list items lead the stream ahead of repeats. */
  ownedPersonalListIds?: ReadonlySet<string>;
  dueTimerRevision?: number;
  typingModeEnabled?: boolean;
  tiltGameEnabled?: boolean;
  progressPlanRevision?: string | number;
}

type LearningUiState = {
  resetKey: string;
  showNotReady: boolean;
  dismissedGames: Set<string>;
};

function resolveStateAction<T>(action: SetStateAction<T>, previous: T): T {
  return typeof action === 'function' ? (action as (value: T) => T)(previous) : action;
}

function useResettableLearningUiState(resetKey: string): {
  showNotReady: boolean;
  setShowNotReady: Dispatch<SetStateAction<boolean>>;
  dismissedGames: Set<string>;
  setDismissedGames: Dispatch<SetStateAction<Set<string>>>;
} {
  const [stored, setStored] = useState<LearningUiState>(() => ({
    resetKey,
    showNotReady: false,
    dismissedGames: new Set(),
  }));
  const current = stored.resetKey === resetKey
    ? stored
    : { resetKey, showNotReady: false, dismissedGames: new Set<string>() };

  const setShowNotReady: Dispatch<SetStateAction<boolean>> = (action) => {
    setStored((previous) => {
      const base = previous.resetKey === resetKey ? previous : current;
      return { ...base, showNotReady: resolveStateAction(action, base.showNotReady) };
    });
  };
  const setDismissedGames: Dispatch<SetStateAction<Set<string>>> = (action) => {
    setStored((previous) => {
      const base = previous.resetKey === resetKey ? previous : current;
      return { ...base, dismissedGames: resolveStateAction(action, base.dismissedGames) };
    });
  };

  return {
    showNotReady: current.showNotReady,
    setShowNotReady,
    dismissedGames: current.dismissedGames,
    setDismissedGames,
  };
}

export function useLearningPageState({
  activeWords: _activeWords,
  filteredWords,
  selectedCategories,
  progress,
  isHydrated,
  minigameFrequency,
  categoryOrder,
  pinnedCategoryIds,
  ownedPersonalListIds,
  dueTimerRevision = 0,
  typingModeEnabled = false,
  tiltGameEnabled = false,
  progressPlanRevision = 0,
}: UseLearningPageStateOptions) {
  const [minigameSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000_000));
  const selectedCategoriesKey = Array.from(selectedCategories).sort().join('|');
  const categoryOrderKey = categoryOrder.join('|');
  const wordsResetKey = useMemo(() => {
    let hash = 5381;
    for (const word of filteredWords) {
      const categoryPositionSig = Object.entries(word.categoryPositions ?? {})
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([category, position]) => `${category}:${position}`)
        .join(',');
      const signature = `${word.id}:${word.listPosition ?? ''}:${categoryPositionSig}`;
      for (let i = 0; i < signature.length; i += 1) {
        hash = ((hash << 5) + hash + signature.charCodeAt(i)) | 0;
      }
    }
    return `${filteredWords.length}:${hash}:${categoryOrderKey}`;
  }, [categoryOrderKey, filteredWords]);

  const uiResetKey = `${selectedCategoriesKey}::${wordsResetKey}`;
  const {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
  } = useResettableLearningUiState(uiResetKey);

  const statsWords = useMemo(
    () => filteredWords,
    [filteredWords]
  );

  const { priorityWords, priorityDueCount, dueWords, newWords, settlingWords } = useWordStream(
    filteredWords,
    progress,
    isHydrated,
    categoryOrder,
    dueTimerRevision,
    pinnedCategoryIds,
    ownedPersonalListIds,
  );
  // "Review due" means repeats. The learner's own words lead the stream, but a
  // word they have never studied is not something to review, so only priority
  // words that are genuinely due count here.
  const readyCount = priorityDueCount + dueWords.length;

  const learnedPool = useMemo(
    () => filteredWords.filter((word) => (progress[word.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );
  const getStageIndex = useCallback(
    (wordId: string) => progress[wordId]?.stageIndex ?? 0,
    [progress],
  );

  const { streamGroupedWords } = useLearningStreamGroups({
    priorityWords,
    dueWords,
    newWords,
    settlingWords,
    showNotReady,
    learnedPool,
    isHydrated,
    minigameFrequency,
    dismissedGames,
    minigameSeed,
    selectedCategoriesKey,
    wordsResetKey,
    // Temporary QA mode: enabling the frontier tilt quiz makes it the only
    // scheduled minigame. Turning it off restores the normal rotation (with
    // typing still excluded when typing is the primary study mode).
    excludeGameTypes: tiltGameEnabled
      ? ['multipleChoice', 'typing', 'matching']
      : typingModeEnabled
        ? ['typing']
        : [],
    includeGameTypes: tiltGameEnabled ? ['tiltChoice'] : [],
    getStageIndex,
    progressPlanRevision,
  });

  // Keep the background audio repair aligned with the same ordering the learner
  // sees. Minigames are deliberately excluded: they are derived UI, not study
  // items, and must never cause extra TTS work.
  const upcomingAudioWords = useMemo(
    () => [
      ...priorityWords,
      ...dueWords,
      ...newWords,
      ...(showNotReady ? settlingWords : []),
    ].slice(0, 5),
    [dueWords, newWords, priorityWords, settlingWords, showNotReady],
  );

  const progressStats = useMemo(
    () => calculateProgressStats(statsWords, progress, readyCount),
    [statsWords, progress, readyCount]
  );

  return {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    dueWords,
    settlingWords,
    streamGroupedWords,
    cardDeckGroups: streamGroupedWords,
    upcomingAudioWords,
    progressStats,
  };
}
