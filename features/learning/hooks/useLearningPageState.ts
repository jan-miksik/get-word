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
  /** The learner asked to carry on past the day's plan; the stream stops being capped. */
  continueAnyway?: boolean;
  /**
   * Cards answered in the deck whose SRS write is still queued behind the exit
   * animation. They count towards the rails immediately, so marking an answer
   * moves the progress on the tap rather than when the card has flown away.
   */
  pendingAnsweredIds?: ReadonlySet<string>;
  /** Immutable target claimed by the server for the current local day. */
  dayTargets?: { resolvedNewTarget: number | null; resolvedReviewTarget: number | null; resolvedItemBudget: number | null } | null;
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
  continueAnyway = false,
  pendingAnsweredIds,
  dayTargets = null,
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
  const targetScope = dayTargets
    ? `targets:${dayTargets.resolvedNewTarget ?? '-'}:${dayTargets.resolvedReviewTarget ?? '-'}:${dayTargets.resolvedItemBudget ?? '-'}`
    : 'targets:pending';
  const canonicalScopeKey = `${sessionScopeKey}|categories:${selectedCategoriesKey || 'all'}|${targetScope}`;
  const session = useSessionPlan({
    stream: baseStream,
    progress,
    goal: studyGoal,
    isSessionDataReady: isSessionDataReady ?? isHydrated,
    dayKey: sessionDayKey,
    timezone: sessionTimezone,
    scopeKey: canonicalScopeKey,
    continueAnyway,
    dayTargets,
  });
  const liveById = useMemo(() => {
    const words = new Map<string, NormalizedWord>();
    for (const word of [...priorityWords, ...dueWords, ...newWords]) words.set(word.id, word);
    return words;
  }, [dueWords, newWords, priorityWords]);
  // A same-day repeat block asks for words answered minutes ago, which are
  // settling rather than due. They are off-limits to every other block — that
  // is what "not ready" means — but a second pass is precisely their point.
  const settlingById = useMemo(() => {
    const words = new Map<string, NormalizedWord>();
    for (const word of settlingWords) words.set(word.id, word);
    return words;
  }, [settlingWords]);
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
        words: block.ids
          .map((id) => liveById.get(id) ?? ((block.pass ?? 1) > 1 ? settlingById.get(id) : undefined))
          .filter((word): word is NormalizedWord => Boolean(word)),
      }))
      .filter((block) => block.words.length > 0);
  }, [dueWords, liveById, newWords, priorityWords, session.dailyPlan, session.streamMode, settlingById]);
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
  // Repeats that are due *right now* across the whole stream, whatever today's
  // plan happened to take from it. Answering a word moves it out of the due
  // bucket, so once the plan is walked this is exactly the backlog the Upcoming
  // panel lists — which is why the closing card quotes this number instead of
  // reading an emptied plan as "nothing due".
  const dueNowCount = priorityDueCount + dueWords.length;

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
    // similarWordsPrompt is parked: asking the learner to generate neighbours
    // mid-stream is the wrong moment for it. Thin distractor pools will instead
    // be filled deterministically from a frequency list of the target language,
    // without interrupting the round.
    excludeGameTypes: tiltGameEnabled ? ['multipleChoice', 'typing', 'matching'] : [],
    includeGameTypes: tiltGameEnabled
      ? ['tiltChoice', 'bubbleChoice']
      : ['bubbleChoice'],
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
    () => computeBlockProgress(session.dailyPlan?.blocks ?? [], {
      progress,
      liveIds: new Set(liveById.keys()),
      settlingIds: new Set(settlingById.keys()),
      dayKey: sessionDayKey,
      timezone: sessionTimezone,
      pendingIds: pendingAnsweredIds,
      answerBaseline: session.dailyPlan?.answerBaseline,
    }),
    [liveById, pendingAnsweredIds, progress, session.dailyPlan, sessionDayKey, sessionTimezone, settlingById],
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
    dueNowCount,
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
