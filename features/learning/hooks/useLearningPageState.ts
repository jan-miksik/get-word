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
import { hasIntroducedWord, type StudyGoalVersion } from '@/packages/domain/goals/goal';
import { useSessionPlan } from '@/features/learning/session/useSessionPlan';
import { computeBlockProgress } from '@/features/learning/session/dayProgress';
import { wordMatchesSessionBlock } from '@/features/learning/session/blockClassification';
import {
  recordBlockGames,
  summarizeBlockGames,
  type BlockGameLedger,
} from '@/features/learning/session/blockGames';
import type { SessionBlock, SessionBlockKind } from '@/features/learning/session/blocks';
import type { LearningStreamBlock } from '@/features/learning/types';
import { useTimePhase, type TimePhaseInput } from '@/features/learning/session/useTimePhase';
import {
  captureTimedReinforcement,
  resolveTimedStream,
  type TimedReinforcementSnapshot,
} from '@/features/learning/session/timedStream';

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
  /** The learner asked for one finite bonus round past the day's plan. */
  continueAnyway?: boolean;
  /**
   * Cards committed in this tab whose optimistic SRS state is still catching
   * up, keyed by the answer count immediately before that commit. A merely
   * checked typing/choice answer must never advance a block.
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
  /** The measured clock for a minutes goal; its phase split comes from the frozen plan. */
  timeGoal?: Omit<TimePhaseInput, 'phaseShares'> | null;
  /** Immutable target claimed by the server for the current local day. */
  dayTargets?: { resolvedNewTarget: number | null; resolvedReviewTarget: number | null; resolvedItemBudget: number | null } | null;
}

type LearningUiState = {
  resetKey: string;
  showNotReady: boolean;
  dismissedGames: Set<string>;
};

type SessionDay = { dayKey: string; timezone: string };

/**
 * How large one opt-in bonus round may be.
 *
 * The leftovers can be dozens of words. Ten is short enough for the learner to
 * see the end before deliberately opting into another round.
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
  const push = (
    kind: SessionBlockKind,
    words: NormalizedWord[],
    options: { pass?: number; reinforcement?: true } = {},
  ) => {
    if (words.length === 0) return;
    blocks.push({
      key: `bonus-${kind}-${blocks.length}`,
      kind,
      ids: words.slice(0, BONUS_BLOCK_SIZE).map((word) => word.id),
      ...options,
    });
  };
  // One click means one predictable kind of work. Due reviews always win; new
  // material is offered only after that queue is empty. New words include their
  // own immediate, non-SRS second pass before the done card returns.
  if (input.reviewWords.length > 0) {
    push('review', input.reviewWords);
  } else {
    push('new', input.newWords);
    push('review', input.newWords, { pass: 2, reinforcement: true });
  }
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
  timeGoal,
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
  const timePhase = useTimePhase(
    timeGoal
      ? { ...timeGoal, phaseShares: session.dailyPlan?.timePhaseShares }
      : null,
  );
  const timePhaseKinds = session.dailyPlan?.timePhaseKinds;
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
  // The bonus round is frozen from the live leftovers at the moment the learner
  // opts in. Its blocks must drive the deck as well as the rail.
  const bonusReviewWords = useMemo(
    () => [...priorityWords.slice(0, priorityDueCount), ...dueWords].slice(0, BONUS_BLOCK_SIZE),
    [dueWords, priorityDueCount, priorityWords],
  );
  const bonusNewWords = useMemo(
    () => [...priorityWords.slice(priorityDueCount), ...newWords].slice(0, BONUS_BLOCK_SIZE),
    [newWords, priorityDueCount, priorityWords],
  );
  const [bonus, setBonus] = useState<{ blocks: SessionBlock[]; baseline: Record<string, number> } | null>(null);
  const bonusSnapshot = continueAnyway
    ? bonus ?? freezeBonusRound({ reviewWords: bonusReviewWords, newWords: bonusNewWords, progress })
    : null;
  useEffect(() => {
    if (bonusSnapshot === bonus) return;
    // The snapshot is written once when the bonus begins and cleared when the
    // learner returns to the closing card.
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
  const reinforcementPhase =
    timePhase !== undefined &&
    timePhaseKinds?.[timePhase] === 'review' &&
    timePhase > 0 &&
    timePhaseKinds[timePhase - 1] === 'new'
      ? timePhase
      : null;
  const reinforcementScope = `${session.planIdentity ?? 'unplanned'}:${reinforcementPhase ?? '-'}`;
  const candidateReinforcement = useMemo(
    () => reinforcementPhase === null
      ? null
      : captureTimedReinforcement({
          phase: reinforcementPhase,
          dayKey: sessionDayKey,
          timezone: sessionTimezone,
          words: filteredWords,
          progress,
          pendingAnswers,
        }),
    [filteredWords, pendingAnswers, progress, reinforcementPhase, sessionDayKey, sessionTimezone],
  );
  const [heldReinforcement, setHeldReinforcement] = useState<{
    scope: string;
    snapshot: TimedReinforcementSnapshot;
  } | null>(null);
  const reinforcement = heldReinforcement?.scope === reinforcementScope
    ? heldReinforcement.snapshot
    : candidateReinforcement;
  useEffect(() => {
    if (!candidateReinforcement || heldReinforcement?.scope === reinforcementScope) return;
    // The answer floor belongs to the instant the closing phase begins. Holding
    // it is what makes every newly introduced word leave after exactly one more
    // answer instead of reappearing for the rest of the clock stretch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeldReinforcement({ scope: reinforcementScope, snapshot: candidateReinforcement });
  }, [candidateReinforcement, heldReinforcement?.scope, reinforcementScope]);

  const timedStream = useMemo(
    () => resolveTimedStream({
      phase: timePhase,
      phaseKinds: timePhaseKinds,
      priorityWords,
      priorityDueCount,
      dueWords,
      newWords,
      allWords: filteredWords,
      progress,
      pendingAnswers,
      reinforcement,
    }),
    [dueWords, filteredWords, newWords, pendingAnswers, priorityDueCount, priorityWords, progress, reinforcement, timePhase, timePhaseKinds],
  );

  const timeKindOverrideScope = session.planIdentity ?? 'unplanned';
  const [heldTimeKindOverrides, setHeldTimeKindOverrides] = useState<{
    scope: string;
    values: Partial<Record<number, 'new' | 'review'>>;
  }>({ scope: timeKindOverrideScope, values: {} });
  const timeKindOverrides = useMemo(
    () => (heldTimeKindOverrides.scope === timeKindOverrideScope ? heldTimeKindOverrides.values : {}),
    [heldTimeKindOverrides, timeKindOverrideScope],
  );
  useEffect(() => {
    if (
      timePhase === undefined ||
      !timedStream.activeKind ||
      timedStream.activeKind === timePhaseKinds?.[timePhase] ||
      timeKindOverrides[timePhase] === timedStream.activeKind
    ) return;
    // Remember an early opening hand-off after the clock moves on. Otherwise
    // the completed side segment would change colour back on the next phase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeldTimeKindOverrides((previous) => ({
      scope: timeKindOverrideScope,
      values: {
        ...(previous.scope === timeKindOverrideScope ? previous.values : {}),
        [timePhase]: timedStream.activeKind!,
      },
    }));
  }, [timeKindOverrideScope, timeKindOverrides, timePhase, timePhaseKinds, timedStream.activeKind]);

  // If the opening due queue is genuinely exhausted, the learner moves into
  // new material immediately. Reflect that hand-off in the time rail as well as
  // in the deck so its colours never claim the opposite kind of work.
  const displayedTimePhaseKinds = useMemo(() => {
    if (!timePhaseKinds) return timePhaseKinds;
    const kinds = timePhaseKinds.map((kind, phase) => timeKindOverrides[phase] ?? kind);
    if (timePhase !== undefined && timedStream.activeKind) kinds[timePhase] = timedStream.activeKind;
    return kinds;
  }, [timeKindOverrides, timePhase, timePhaseKinds, timedStream.activeKind]);

  const transitionScope = `${session.planIdentity ?? 'unplanned'}:${timeGoal?.dayKey ?? '-'}`;
  const [timeTransitionAck, setTimeTransitionAck] = useState<{ scope: string; phase: number }>({
    scope: transitionScope,
    phase: timePhase ?? -1,
  });
  const acknowledgedTimePhase = timeTransitionAck.scope === transitionScope
    ? timeTransitionAck.phase
    : timePhase ?? -1;
  useEffect(() => {
    if (timeTransitionAck.scope === transitionScope) return;
    // A reload resumes the current phase; it must not manufacture a transition
    // for a boundary the learner crossed in the previous page life.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeTransitionAck({ scope: transitionScope, phase: timePhase ?? -1 });
  }, [timePhase, timeTransitionAck.scope, transitionScope]);
  const hasNewToReviewTransition = Boolean(
    timeGoal &&
    timePhaseKinds &&
    timePhase !== undefined &&
    timePhase > acknowledgedTimePhase &&
    timePhase > 0 &&
    displayedTimePhaseKinds?.[timePhase - 1] === 'new' &&
    displayedTimePhaseKinds?.[timePhase] === 'review',
  );
  const dismissTimeTransition = useCallback(() => {
    if (timePhase === undefined) return;
    setTimeTransitionAck({ scope: transitionScope, phase: timePhase });
  }, [timePhase, transitionScope]);

  const streamBlocks = useMemo<LearningStreamBlock[]>(() => {
    if (continueAnyway && bonusSnapshot) {
      return bonusSnapshot.blocks
        .map((block, blockIndex) => ({ block, blockIndex }))
        .filter(({ block }) => !settledBonusBlockKeys.has(block.key))
        .map(({ block, blockIndex }) => ({
          key: block.key,
          kind: block.kind,
          blockIndex,
          ...(block.reinforcement ? { reinforcement: true as const } : {}),
          words: block.ids
            .map((id) =>
              liveById.get(id) ?? ((block.pass ?? 1) > 1 ? settlingById.get(id) : undefined)
            )
            .filter((word): word is NormalizedWord => Boolean(word))
            .filter((word) => wordMatchesSessionBlock(
              block,
              progress[word.id],
              pendingAnswers?.[word.id] !== undefined,
            )),
        }))
        .filter((block) => block.words.length > 0);
    }
    if (timeGoal && timePhase !== undefined) {
      return timedStream.block ? [timedStream.block] : [];
    }
    if (session.streamMode !== 'planned' || !session.dailyPlan) {
      // A pinned or personal word the learner has never met is still a new
      // word. `priorityWords` leads with the repeats among them and ends with
      // the unseen ones (see `useWordStream`), so handing the whole bucket to
      // the opening review block put brand-new words under a rail labelled
      // "review" — and left them out of the new-word block entirely. This path
      // runs before the day's plan resolves, so it is the very first thing the
      // learner sees; `planSession` and the minutes stream both split the same
      // bucket the same way.
      return [
        {
          key: 'review-0',
          kind: 'review' as const,
          blockIndex: 0,
          words: [...priorityWords.slice(0, priorityDueCount), ...dueWords],
        },
        {
          key: 'new-0',
          kind: 'new' as const,
          blockIndex: 1,
          words: [...priorityWords.slice(priorityDueCount), ...newWords],
        },
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
          .map((id) =>
            liveById.get(id) ?? ((block.pass ?? 1) > 1 ? settlingById.get(id) : undefined)
          )
          .filter((word): word is NormalizedWord => Boolean(word))
          .filter((word) => wordMatchesSessionBlock(
            block,
            progress[word.id],
            pendingAnswers?.[word.id] !== undefined,
          )),
      }))
      .filter((block) => block.words.length > 0);
  }, [bonusSnapshot, continueAnyway, dueWords, liveById, newWords, pendingAnswers, priorityDueCount, priorityWords, progress, session.dailyPlan, session.streamMode, settledBonusBlockKeys, settledPlanBlockKeys, settlingById, timeGoal, timePhase, timedStream.block]);
  const plannedDueWords = session.dailyPlan
    ? dueWords.filter((word) => session.dailyPlan!.dueIds.includes(word.id))
    : dueWords;
  // Repeats that are due *right now* across the whole stream, whatever today's
  // plan happened to take from it. The inventory reading keeps the full count;
  // the closing-card offer below is capped to one finite bonus round.
  const totalDueNowCount = priorityDueCount + dueWords.length;
  // Name the work the next click actually starts, not the whole inventory.
  const dueNowCount = Math.min(BONUS_BLOCK_SIZE, totalDueNowCount);
  const availableNewNowCount = timeGoal
    ? new Set([
        ...priorityWords.filter((word) => !hasIntroducedWord(progress[word.id])).map((word) => word.id),
        ...newWords.map((word) => word.id),
      ]).size
    : bonusNewWords.length;
  const newNowCount = totalDueNowCount > 0
    ? 0
    : Math.min(BONUS_BLOCK_SIZE, availableNewNowCount);

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
    retainedBlockKeys: timeGoal
      ? streamBlocks.map((block) => block.key)
      : bonusSnapshot?.blocks.map((block) => block.key) ??
        session.dailyPlan?.blocks.map((block) => block.key) ??
        streamBlocks.map((block) => block.key),
    // An explicit closing reinforcement block owns the settling words in a
    // minutes session. Appending the generic "not ready" group here could leak
    // repeats into the clock's new-word phase.
    settlingWords: timeGoal ? [] : settlingWords,
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
    // "Ready for review" is an inventory reading next to the total word count,
    // so it must be the whole due-now backlog. Scoping it to what today's plan
    // took showed 0 the moment the plan was walked, while repeats were waiting.
    () => calculateProgressStats(filteredWords, progress, totalDueNowCount),
    [filteredWords, progress, totalDueNowCount]
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
    timePhase,
    timePhaseKinds: displayedTimePhaseKinds,
    timePhaseEmptyKind: hasNewToReviewTransition ? null : timedStream.emptyKind,
    timeTransition: hasNewToReviewTransition
      ? { from: 'new' as const, to: 'review' as const, dismiss: dismissTimeTransition }
      : null,
  };
}
