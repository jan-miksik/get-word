'use client';

import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction, useState } from 'react';
import type { ProgressData } from '@/features/sync/contracts';
import { currentIanaTimezone, localDayKeyAt } from '@/lib/local-day';
import { calculateProgressStats } from '@/lib/progress-stats';
import type { NormalizedWord } from '@/lib/words';
import type { MinigameFrequencyRange } from '@/features/learning/minigames';
import type { FineTuneConfig } from '@/features/learning/fine-tune/types';
import { useLearningStreamGroups } from './useLearningStreamGroups';
import { useWordStream } from './useWordStream';
import type { ViewMode } from '../app-state/types';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
import { useSessionPlan } from '@/features/learning/session/useSessionPlan';
import { computeBlockProgress } from '@/features/learning/session/dayProgress';
import type { LearningStreamBlock } from '@/features/learning/types';

interface UseLearningPageStateOptions {
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
  tiltGameEnabled?: boolean;
  fineTuneConfig?: FineTuneConfig;
  progressPlanRevision?: string | number;
  studyGoal?: StudyGoalVersion | null;
  /** True only when cached hydration and the initial server sync are both settled. */
  isSessionDataReady?: boolean;
  /** Canonical language-pair part of the persisted daily-plan scope. */
  sessionScopeKey?: string;
}

type LearningUiState = {
  resetKey: string;
  showNotReady: boolean;
  dismissedGames: Set<string>;
};

type SessionDay = { dayKey: string; timezone: string };

function readSessionDay(): SessionDay {
  const timezone = currentIanaTimezone();
  return { timezone, dayKey: localDayKeyAt(Date.now(), timezone) };
}

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
  filteredWords,
  selectedCategories,
  progress,
  isHydrated,
  minigameFrequency,
  categoryOrder,
  pinnedCategoryIds,
  ownedPersonalListIds,
  dueTimerRevision = 0,
  tiltGameEnabled = false,
  fineTuneConfig,
  progressPlanRevision = 0,
  studyGoal = null,
  isSessionDataReady,
  sessionScopeKey = 'pair:unknown',
}: UseLearningPageStateOptions) {
  const [sessionDay, setSessionDay] = useState<SessionDay>(readSessionDay);
  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = readSessionDay();
      if (next.dayKey !== sessionDay.dayKey || next.timezone !== sessionDay.timezone) setSessionDay(next);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [sessionDay]);
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

  const { priorityWords, priorityDueCount, dueWords, newWords, settlingWords } = useWordStream(
    filteredWords,
    progress,
    isHydrated,
    categoryOrder,
    dueTimerRevision,
    pinnedCategoryIds,
    ownedPersonalListIds,
  );
  const baseStream = { priorityWords, priorityDueCount, dueWords, newWords, settlingWords };
  const { timezone: sessionTimezone, dayKey: sessionDayKey } = sessionDay;
  const canonicalScopeKey = `${sessionScopeKey}|categories:${selectedCategoriesKey || 'all'}`;
  const session = useSessionPlan({
    stream: baseStream,
    progress,
    goal: studyGoal,
    isSessionDataReady: isSessionDataReady ?? isHydrated,
    dayKey: sessionDayKey,
    timezone: sessionTimezone,
    scopeKey: canonicalScopeKey,
  });
  const liveById = useMemo(() => {
    const words = new Map<string, NormalizedWord>();
    for (const word of [...priorityWords, ...dueWords, ...newWords]) words.set(word.id, word);
    return words;
  }, [dueWords, newWords, priorityWords]);
  const streamBlocks = useMemo<LearningStreamBlock[]>(() => {
    if (session.streamMode !== 'planned' || !session.dailyPlan) {
      return [
        { key: 'review-0', kind: 'review' as const, blockIndex: 0, words: [...priorityWords, ...dueWords] },
        { key: 'new-0', kind: 'new' as const, blockIndex: 1, words: newWords },
      ].filter((block) => block.words.length > 0);
    }
    return session.dailyPlan.blocks
      .map((block, blockIndex) => ({
        key: block.key,
        kind: block.kind,
        blockIndex,
        words: block.ids.map((id) => liveById.get(id)).filter((word): word is NormalizedWord => Boolean(word)),
      }))
      .filter((block) => block.words.length > 0);
  }, [dueWords, liveById, newWords, priorityWords, session.dailyPlan, session.streamMode]);
  const plannedPriorityWords = session.dailyPlan
    ? priorityWords.filter((word) => session.dailyPlan!.priorityIds.includes(word.id))
    : priorityWords;
  const plannedDueWords = session.dailyPlan
    ? dueWords.filter((word) => session.dailyPlan!.dueIds.includes(word.id))
    : dueWords;
  // "Review due" means repeats. The learner's own words lead the stream, but a
  // word they have never studied is not something to review, so only priority
  // words that are genuinely due count here.
  const readyCount = plannedPriorityWords.filter((word) => (progress[word.id]?.stageIndex ?? 0) > 0).length + plannedDueWords.length;

  const learnedPool = useMemo(
    () => filteredWords.filter((word) => (progress[word.id]?.stageIndex ?? 0) > 0),
    [filteredWords, progress]
  );
  const getStageIndex = useCallback(
    (wordId: string) => progress[wordId]?.stageIndex ?? 0,
    [progress],
  );

  const { streamGroups } = useLearningStreamGroups({
    blocks: streamBlocks,
    retainedBlockKeys: session.dailyPlan?.blocks.map((block) => block.key) ?? streamBlocks.map((block) => block.key),
    settlingWords,
    showNotReady,
    learnedPool,
    isHydrated,
    minigameFrequency,
    dismissedGames,
    planIdentity: session.planIdentity,
    selectedCategoriesKey,
    wordsResetKey,
    // The bubble game is a review interlude in the normal rotation. Temporary
    // QA mode adds tilt while keeping bubbles available for SR coverage.
    excludeGameTypes: tiltGameEnabled ? ['multipleChoice', 'typing', 'matching'] : [],
    includeGameTypes: tiltGameEnabled
      ? ['tiltChoice', 'bubbleChoice', 'similarWordsPrompt']
      : ['bubbleChoice', 'similarWordsPrompt'],
    getStageIndex,
    fineTuneConfig,
    progressPlanRevision,
  });

  // Keep the background audio repair aligned with the same ordering the learner
  // sees. Minigames are deliberately excluded: they are derived UI, not study
  // items, and must never cause extra TTS work.
  const upcomingAudioWords = useMemo(
    () => [...streamBlocks.flatMap((block) => block.words), ...(showNotReady ? settlingWords : [])].slice(0, 5),
    [settlingWords, showNotReady, streamBlocks],
  );
  const sessionBlockProgress = useMemo(
    () => computeBlockProgress(
      session.dailyPlan?.blocks ?? [],
      progress,
      new Set(streamBlocks.flatMap((block) => block.words.map((word) => word.id))),
      sessionDayKey,
      sessionTimezone,
    ),
    [progress, session.dailyPlan, sessionDayKey, sessionTimezone, streamBlocks],
  );

  const progressStats = useMemo(
    () => calculateProgressStats(filteredWords, progress, readyCount),
    [filteredWords, progress, readyCount]
  );

  return {
    showNotReady,
    setShowNotReady,
    dismissedGames,
    setDismissedGames,
    dueWords: plannedDueWords,
    session,
    settlingWords,
    streamGroups,
    /** @deprecated Compatibility projection for tests and transitional consumers. */
    streamGroupedWords: streamGroups.map((group) => group.items),
    cardDeckGroups: streamGroups.map((group) => group.items),
    upcomingAudioWords,
    progressStats,
    sessionBlockProgress,
  };
}
