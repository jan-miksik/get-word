'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WordStream } from '@/features/learning/hooks/useWordStream';
import type { ProgressData } from '@/features/sync/contracts';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
import { hasIntroducedWord } from '@/packages/domain/goals/goal';
import { localDayKeyAt } from '@/lib/local-day';
import { planSession, type SessionPlan } from './plan';
import {
  pruneSessionPlans,
  readSessionPlan,
  sessionPlanIdentity,
  storeSessionPlan,
  type SessionPlanStorageScope,
} from './storage';

type SessionStreamMode = 'planned' | 'overflow' | 'unbounded';

export interface ResolvedSessionPlan {
  /** The frozen plan remains available even when the learner continues past it. */
  dailyPlan: SessionPlan | null;
  streamMode: SessionStreamMode;
  planIdentity: string | null;
}

function dayDistance(fromDayKey: string, toDayKey: string): number {
  const from = Date.parse(`${fromDayKey}T00:00:00Z`);
  const to = Date.parse(`${toDayKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function deriveAbsenceDays(progress: Record<string, ProgressData>, dayKey: string, timezone: string): number {
  const lastActivity = Object.values(progress).reduce(
    (latest, entry) => Math.max(latest, entry.lastKnownAt ?? 0, entry.lastUnknownAt ?? 0),
    0,
  );
  return lastActivity > 0 ? dayDistance(localDayKeyAt(lastActivity, timezone), dayKey) : 0;
}

function planCacheIdentity(storageIdentity: string, plan: SessionPlan): string {
  const blocks = plan.blocks.map((block) => `${block.key}:${block.ids.join(',')}`).join('|');
  return `${storageIdentity}|${blocks}`;
}

/**
 * Add words committed from the mid-session top-up card to the still-frozen
 * minutes plan. Completed blocks and their answer baselines stay intact; only
 * the missing new-word slots and their closing reinforcement are filled.
 */
export function extendTimeSessionPlan(
  plan: SessionPlan,
  stream: Pick<WordStream, 'priorityWords' | 'newWords'>,
  progress: Record<string, ProgressData>,
): SessionPlan {
  if (!plan.timePhaseKinds || plan.newShortfall <= 0) return plan;
  const planned = new Set(plan.blocks.flatMap((block) => block.ids));
  const candidates = [...stream.priorityWords, ...stream.newWords].filter(
    (word, index, words) =>
      !hasIntroducedWord(progress[word.id]) &&
      !planned.has(word.id) &&
      words.findIndex((candidate) => candidate.id === word.id) === index,
  );
  const added = candidates.slice(0, plan.newShortfall).map((word) => word.id);
  if (added.length === 0) return plan;

  const newPhase = plan.timePhaseKinds.indexOf('new');
  const reinforcementPhase = plan.timePhaseKinds.lastIndexOf('review');
  const newBlockIndex = plan.blocks.findIndex(
    (block) => block.kind === 'new' && !block.reinforcement,
  );
  const reinforcementIndex = plan.blocks.findIndex((block) => block.reinforcement === true);
  const blocks = plan.blocks.map((block) => ({ ...block, ids: [...block.ids] }));
  if (newBlockIndex >= 0) blocks[newBlockIndex].ids.push(...added);
  else blocks.push({ key: 'new-0', kind: 'new', ids: [...added], phase: newPhase });
  if (reinforcementIndex >= 0) blocks[reinforcementIndex].ids.push(...added);
  else {
    const reviewIndex = blocks.filter((block) => block.kind === 'review').length;
    blocks.push({
      key: `review-${reviewIndex}`,
      kind: 'review',
      ids: [...added],
      pass: 2,
      phase: reinforcementPhase,
      reinforcement: true,
    });
  }
  blocks.sort((left, right) => (left.phase ?? 0) - (right.phase ?? 0));
  const answerBaseline = { ...plan.answerBaseline };
  for (const id of added) {
    answerBaseline[id] = (progress[id]?.knownCount ?? 0) + (progress[id]?.unknownCount ?? 0);
  }

  return {
    ...plan,
    newIds: [...plan.newIds, ...added],
    blocks,
    answerBaseline,
    newShortfall: Math.max(0, plan.newShortfall - added.length),
    shortfall: Math.max(0, plan.shortfall - (2 * added.length)),
  };
}

/**
 * Fill the new-word slots a words plan froze empty.
 *
 * The plan is frozen for the whole day, so a plan that froze before the learner
 * had words — a first list still being written, or the top-up the preflight
 * card itself asks for — would otherwise stay short until midnight, and the
 * words just added would wait for tomorrow.
 *
 * Only while the introduction has not started: appending to a block the session
 * already walked past would reopen it mid-day.
 */
export function extendWordsSessionPlan(
  plan: SessionPlan,
  stream: Pick<WordStream, 'priorityWords' | 'newWords'>,
  progress: Record<string, ProgressData>,
): SessionPlan {
  if (plan.timePhaseKinds || plan.newShortfall <= 0) return plan;
  const newBlockIndex = plan.blocks.findIndex(
    (block) => block.kind === 'new' && !block.reinforcement,
  );
  if (newBlockIndex >= 0 && plan.blocks[newBlockIndex].ids.some(
    (id) => hasIntroducedWord(progress[id]),
  )) return plan;

  const planned = new Set(plan.blocks.flatMap((block) => block.ids));
  const candidates = [...stream.priorityWords, ...stream.newWords].filter(
    (word, index, words) =>
      !hasIntroducedWord(progress[word.id]) &&
      !planned.has(word.id) &&
      words.findIndex((candidate) => candidate.id === word.id) === index,
  );
  const added = candidates.slice(0, plan.newShortfall).map((word) => word.id);
  if (added.length === 0) return plan;

  const blocks = plan.blocks.map((block) => ({ ...block, ids: [...block.ids] }));
  if (newBlockIndex >= 0) blocks[newBlockIndex].ids.push(...added);
  else {
    const newIndex = blocks.filter((block) => block.kind === 'new').length;
    blocks.push({ key: `new-${newIndex}`, kind: 'new', ids: [...added] });
  }
  const reinforcementIndex = blocks.findIndex((block) => block.reinforcement === true);
  if (reinforcementIndex >= 0) blocks[reinforcementIndex].ids.push(...added);
  else {
    const reviewIndex = blocks.filter((block) => block.kind === 'review').length;
    blocks.push({
      key: `review-${reviewIndex}`,
      kind: 'review',
      ids: [...added],
      pass: 2,
      reinforcement: true,
    });
  }
  const answerBaseline = { ...plan.answerBaseline };
  for (const id of added) {
    answerBaseline[id] = (progress[id]?.knownCount ?? 0) + (progress[id]?.unknownCount ?? 0);
  }

  return {
    ...plan,
    newIds: [...plan.newIds, ...added],
    blocks,
    answerBaseline,
    newShortfall: Math.max(0, plan.newShortfall - added.length),
    // A words day counts distinct words, so each added word closes one card of
    // the gap — unlike a minutes day, where it closes two answer slots.
    shortfall: Math.max(0, plan.shortfall - added.length),
  };
}

export function useSessionPlan(args: {
  stream: WordStream;
  progress: Record<string, ProgressData>;
  goal: StudyGoalVersion | null;
  isSessionDataReady: boolean;
  dayKey: string;
  timezone: string;
  scopeKey: string;
  absenceDays?: number;
  continueAnyway?: boolean;
  dayTargets?: { resolvedNewTarget: number | null; resolvedReviewTarget: number | null; resolvedItemBudget: number | null } | null;
}): ResolvedSessionPlan {
  const absenceDays = args.absenceDays ?? deriveAbsenceDays(args.progress, args.dayKey, args.timezone);
  const candidate = useMemo(() => planSession({
    goal: args.goal,
    priorityWords: args.stream.priorityWords,
    dueWords: args.stream.dueWords,
    newWords: args.stream.newWords,
    progress: args.progress,
    absenceDays,
    dayTargets: args.dayTargets,
  }), [absenceDays, args.dayTargets, args.goal, args.progress, args.stream]);
  const storageScope = useMemo<SessionPlanStorageScope | null>(() => {
    if (!args.goal?.enabled) return null;
    return { dayKey: args.dayKey, scopeKey: args.scopeKey, goalVersionId: args.goal.id };
  }, [args.dayKey, args.goal, args.scopeKey]);
  const identity = storageScope ? sessionPlanIdentity(storageScope) : null;
  const [resolved, setResolved] = useState<{ identity: string; plan: SessionPlan } | null>(null);
  const candidateCount = args.stream.priorityWords.length + args.stream.dueWords.length + args.stream.newWords.length;
  const canFreezeEmptyPlan = args.goal?.mode === 'minutes';

  /* eslint-disable react-hooks/set-state-in-effect -- The frozen plan mirrors localStorage and must settle before a first answer can change the live stream. */
  useEffect(() => {
    if (!storageScope || !args.isSessionDataReady) return;
    const nextIdentity = sessionPlanIdentity(storageScope);
    if (resolved?.identity === nextIdentity) {
      const extended = resolved.plan.timePhaseKinds
        ? extendTimeSessionPlan(resolved.plan, args.stream, args.progress)
        : extendWordsSessionPlan(resolved.plan, args.stream, args.progress);
      if (extended !== resolved.plan) {
        storeSessionPlan(storageScope, extended);
        setResolved({ identity: nextIdentity, plan: extended });
      }
      return;
    }
    const stored = readSessionPlan(storageScope);
    // A completed session has no remaining words in the live stream. Keep (or
    // recover after a reload) the frozen plan so its final progress can still
    // resolve to the completion breather instead of collapsing to no session.
    if (stored) {
      pruneSessionPlans(storageScope.dayKey);
      setResolved({ identity: nextIdentity, plan: stored });
      return;
    }
    if (candidateCount === 0 && !canFreezeEmptyPlan) return;
    const plan = stored ?? candidate;
    if (plan.blocks.length > 0 || plan.timePhaseKinds) storeSessionPlan(storageScope, plan);
    pruneSessionPlans(storageScope.dayKey);
    // This state mirrors an external localStorage read; it intentionally settles
    // after the render that supplied the candidate fallback.
    setResolved({ identity: nextIdentity, plan });
  }, [args.isSessionDataReady, args.progress, args.stream, candidate, candidateCount, canFreezeEmptyPlan, resolved, storageScope]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!storageScope) return { dailyPlan: null, streamMode: 'unbounded', planIdentity: null };
  if (!args.isSessionDataReady) {
    return { dailyPlan: null, streamMode: args.continueAnyway ? 'overflow' : 'planned', planIdentity: identity };
  }
  const dailyPlan = resolved?.identity === identity
    ? resolved.plan
    : candidateCount > 0 || canFreezeEmptyPlan
      ? candidate
      : null;
  return {
    dailyPlan,
    streamMode: args.continueAnyway ? 'overflow' : 'planned',
    planIdentity: dailyPlan ? planCacheIdentity(identity!, dailyPlan) : identity,
  };
}
