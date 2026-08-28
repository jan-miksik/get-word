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
import {
  recordBlockGames,
  summarizeBlockGames,
  type BlockGameLedger,
} from '@/features/learning/session/blockGames';
import type { SessionBlock, SessionBlockKind } from '@/features/learning/session/blocks';
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
   * animation, keyed by the answer count the word carried at the tap. They count
   * towards the rails immediately, so marking an answer moves the progress on
   * the tap rather than when the card has flown away.
   */
  pendingAnswers?: Record<string, number>;
  /**
   * Minigame rounds the learner has worked through. A round is a card like any
   * other, so it fills a slot on the block rail; it never reaches the day's
   * goal, which is counted in words. See `blockGames`.
   */
  completedGameIds?: ReadonlySet<string>;
  /**
   * The stretch a minutes day's clock has reached. Stretches already behind it
   * are dropped from the stream: their time is spent, and their words are
   * simply still due — leaving them at the front of the deck would make the
   * clock advance the session on paper only.
   */
  timePhase?: number;
  /** Immutable target claimed by the server for the current local day. */
  dayTargets?: { resolvedNewTarget: number | null; resolvedReviewTarget: number | null; resolvedItemBudget: number | null } | null;
}

type LearningUiState = {
  resetKey: string;
  showNotReady: boolean;
  dismissedGames: Set<string>;
};

type SessionDay = { dayKey: string; timezone: string };

/** The extra helping of new words offered when the goal names no size itself. */
const DEFAULT_EXTRA_NEW_WORDS = 5;

/**
 * How long one stretch of the bonus round is.
 *
 * The leftovers can be dozens of words, and handing them over as a single block
 * gave the rail one segment that barely moved and the session no seam at all —
 * a learner who had already earned the day was then asked to walk an unbroken
 * wall of repeats with nothing to read progress from. Ten is short enough to
 * see the end of, and it restores the breather between stretches.
 */
const BONUS_BLOCK_SIZE = 10;

/**
 * The stretch the learner opted into once they had already earned the day.
 *
 * Some of these words were answered minutes ago — a stage-0 word falls due again
 * the same day — so "answered today" would mark half the round done before it
 * started. The baseline is where each word stood at opt-in, and the round asks
 * for one answer from there.
 */
function freezeBonusRound(input: {
  reviewWords: NormalizedWord[];
  newWords: NormalizedWord[];
  progress: Record<string, ProgressData>;
}): { blocks: SessionBlock[]; baseline: Record<string, number> } | null {
  const blocks: SessionBlock[] = [];
  const push = (kind: SessionBlockKind, words: NormalizedWord[]) => {
    for (let offset = 0; offset < words.length; offset += BONUS_BLOCK_SIZE) {
      blocks.push({
        key: `bonus-${kind}-${blocks.length}`,
        kind,
        ids: words.slice(offset, offset + BONUS_BLOCK_SIZE).map((word) => word.id),
      });
    }
  };
  push('review', input.reviewWords);
  push('new', input.newWords);
  if (blocks.length === 0) return null;
  const baseline: Record<string, number> = {};
  for (const id of blocks.flatMap((block) => block.ids)) {
    baseline[id] = (input.progress[id]?.knownCount ?? 0) + (input.progress[id]?.unknownCount ?? 0);
  }
  return { blocks, baseline };
}

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
  pendingAnswers,
  completedGameIds,
  timePhase,
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
  // A failed second-pass answer can become due again immediately. It is still
  // due for the SRS, but it no longer belongs to the frozen block the learner
  // has just completed. Without dropping settled blocks here, those words were
  // projected back into both the earlier new block and the reinforcement block:
  // the day flow was complete (and its rail gone), while the deck silently kept
  // serving cards beyond it.
  const settledPlanBlockKeys = useMemo(() => {
    const blocks = computeBlockProgress(session.dailyPlan?.blocks ?? [], {
      progress,
      liveIds: new Set(liveById.keys()),
      settlingIds: new Set(settlingById.keys()),
      dayKey: sessionDayKey,
      timezone: sessionTimezone,
      answerBaseline: session.dailyPlan?.answerBaseline,
    });
    return new Set(
      blocks
        .filter((block) => block.total > 0 && block.done >= block.total)
        .map((block) => block.key),
    );
  }, [liveById, progress, session.dailyPlan, sessionDayKey, sessionTimezone, settlingById]);
  // The overflow round is frozen from the live leftovers at the moment the
  // learner opts in. Its blocks must drive the deck as well as the rail; using
  // the unbounded review/new projection here would collapse the ten-card
  // stretches back into one long block and make both breathers and game ticks
  // disagree with the cards on screen.
  const bonusReviewWords = useMemo(
    () => [...priorityWords.slice(0, priorityDueCount), ...dueWords],
    [dueWords, priorityDueCount, priorityWords],
  );
  const extraNewLimit = Math.max(1, dayTargets?.resolvedNewTarget ?? DEFAULT_EXTRA_NEW_WORDS);
  const bonusNewWords = useMemo(
    () => [...priorityWords.slice(priorityDueCount), ...newWords].slice(0, extraNewLimit),
    [extraNewLimit, newWords, priorityDueCount, priorityWords],
  );
  const [bonus, setBonus] = useState<{ blocks: SessionBlock[]; baseline: Record<string, number> } | null>(null);
  const bonusSnapshot = continueAnyway
    ? bonus ?? freezeBonusRound({ reviewWords: bonusReviewWords, newWords: bonusNewWords, progress })
    : null;
  useEffect(() => {
    if (bonusSnapshot === bonus) return;
    // The snapshot is written once when overflow begins and cleared when the
    // learner returns to the capped day.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBonus(bonusSnapshot);
  }, [bonus, bonusSnapshot]);
  const settledBonusBlockKeys = useMemo(() => {
    const blocks = computeBlockProgress(bonusSnapshot?.blocks ?? [], {
      progress,
      liveIds: new Set(liveById.keys()),
      settlingIds: new Set(settlingById.keys()),
      dayKey: sessionDayKey,
      timezone: sessionTimezone,
      answerBaseline: bonusSnapshot?.baseline,
    });
    return new Set(
      blocks
        .filter((block) => block.total > 0 && block.done >= block.total)
        .map((block) => block.key),
    );
  }, [bonusSnapshot, liveById, progress, sessionDayKey, sessionTimezone, settlingById]);
  const streamBlocks = useMemo<LearningStreamBlock[]>(() => {
    if (continueAnyway && bonusSnapshot) {
      return bonusSnapshot.blocks
        .map((block, blockIndex) => ({ block, blockIndex }))
        .filter(({ block }) => !settledBonusBlockKeys.has(block.key))
        .map(({ block, blockIndex }) => ({
          key: block.key,
          kind: block.kind,
          blockIndex,
          words: block.ids
            .map((id) => liveById.get(id))
            .filter((word): word is NormalizedWord => Boolean(word)),
        }))
        .filter((block) => block.words.length > 0);
    }
    if (session.streamMode !== 'planned' || !session.dailyPlan) {
      return [
        { key: 'review-0', kind: 'review' as const, blockIndex: 0, words: [...priorityWords, ...dueWords] },
        { key: 'new-0', kind: 'new' as const, blockIndex: 1, words: newWords },
      ].filter((block) => block.words.length > 0);
    }
    return session.dailyPlan.blocks
      // The position in the day's own plan, kept through the filter: a stretch
      // dropped by the clock must not renumber the ones still to come.
      .map((block, blockIndex) => ({ block, blockIndex }))
      .filter(({ block }) => !settledPlanBlockKeys.has(block.key))
      .filter(({ block }) => timePhase === undefined || (block.phase ?? 0) >= timePhase)
      .map(({ block, blockIndex }) => ({
        key: block.key,
        kind: block.kind,
        blockIndex,
        ...(block.reinforcement ? { reinforcement: true as const } : {}),
        words: block.ids
          .map((id) => liveById.get(id) ?? ((block.pass ?? 1) > 1 ? settlingById.get(id) : undefined))
          .filter((word): word is NormalizedWord => Boolean(word)),
      }))
      .filter((block) => block.words.length > 0);
  }, [bonusSnapshot, continueAnyway, dueWords, liveById, newWords, priorityWords, session.dailyPlan, session.streamMode, settledBonusBlockKeys, settledPlanBlockKeys, settlingById, timePhase]);
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
  const newNowCount = bonusNewWords.length;

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
    retainedBlockKeys: bonusSnapshot?.blocks.map((block) => block.key) ??
      session.dailyPlan?.blocks.map((block) => block.key) ??
      streamBlocks.map((block) => block.key),
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

  // Rounds are re-derived from the words still standing, so the set a block
  // offers shrinks while it is being answered. The ledger holds every round the
  // block has ever shown, which is what lets the rail count cards without its
  // own denominator falling away underneath it. It is scoped to the frozen
  // plan: a new day, or a new language pair, starts a new ledger.
  const [gameLedger, setGameLedger] = useState<{ identity: string | null; ledger: BlockGameLedger }>({
    identity: null,
    ledger: {},
  });
  useEffect(() => {
    // The ledger records what the stream has already shown, which is knowledge
    // no render can re-derive once the round is gone. It settles once per new
    // round and returns the held object otherwise, so there is no cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGameLedger((held) => {
      const sameScope = held.identity === session.planIdentity;
      const ledger = recordBlockGames(sameScope ? held.ledger : {}, streamGroups);
      return sameScope && ledger === held.ledger ? held : { identity: session.planIdentity, ledger };
    });
  }, [session.planIdentity, streamGroups]);
  const blockGames = useMemo(() => {
    // History from the ledger, plus whatever is on screen this very render, so
    // a round that has only just appeared gets its slot now rather than one
    // render later.
    const known = gameLedger.identity === session.planIdentity ? gameLedger.ledger : {};
    // Only rounds actually played to the end are done. A skipped round leaves
    // the stream and is reported unreachable instead, so its slot disappears
    // rather than filling itself — walking away from an exercise is not doing it.
    return summarizeBlockGames(
      recordBlockGames(known, streamGroups),
      streamGroups,
      completedGameIds ?? new Set<string>(),
    );
  }, [completedGameIds, gameLedger, session.planIdentity, streamGroups]);

  // Keep the background audio repair aligned with the same ordering the learner
  // sees. Minigames are deliberately excluded: they are derived UI, not study
  // items, and must never cause extra TTS work.
  const upcomingAudioWords = useMemo(
    () => [...streamBlocks.flatMap((block) => block.words), ...(showNotReady ? settlingWords : [])].slice(0, 5),
    [settlingWords, showNotReady, streamBlocks],
  );
  const bonusBlockProgress = useMemo(
    () => computeBlockProgress(bonusSnapshot?.blocks ?? [], {
      progress,
      liveIds: new Set(liveById.keys()),
      settlingIds: new Set(settlingById.keys()),
      dayKey: sessionDayKey,
      timezone: sessionTimezone,
      pendingAnswers,
      answerBaseline: bonusSnapshot?.baseline,
      blockGames,
    }),
    [blockGames, bonusSnapshot, liveById, pendingAnswers, progress, sessionDayKey, sessionTimezone, settlingById],
  );

  const sessionBlockProgress = useMemo(
    () => computeBlockProgress(session.dailyPlan?.blocks ?? [], {
      progress,
      liveIds: new Set(liveById.keys()),
      settlingIds: new Set(settlingById.keys()),
      dayKey: sessionDayKey,
      timezone: sessionTimezone,
      pendingAnswers,
      answerBaseline: session.dailyPlan?.answerBaseline,
      blockGames,
    }),
    [blockGames, liveById, pendingAnswers, progress, session.dailyPlan, sessionDayKey, sessionTimezone, settlingById],
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
    newNowCount,
    session,
    settlingWords,
    streamGroups,
    /** @deprecated Compatibility projection for tests and transitional consumers. */
    streamGroupedWords: streamGroups.map((group) => group.items),
    cardDeckGroups: streamGroups.map((group) => group.items),
    upcomingAudioWords,
    progressStats,
    sessionBlockProgress,
    bonusBlockProgress,
  };
}
