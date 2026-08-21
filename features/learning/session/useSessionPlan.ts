'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WordStream } from '@/features/learning/hooks/useWordStream';
import type { ProgressData } from '@/features/sync/contracts';
import type { StudyGoalVersion } from '@/packages/domain/goals/goal';
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

  useEffect(() => {
    if (!storageScope || !args.isSessionDataReady) return;
    const nextIdentity = sessionPlanIdentity(storageScope);
    if (resolved?.identity === nextIdentity) return;
    const stored = readSessionPlan(storageScope);
    // A completed session has no remaining words in the live stream. Keep (or
    // recover after a reload) the frozen plan so its final progress can still
    // resolve to the completion breather instead of collapsing to no session.
    if (stored) {
      pruneSessionPlans(storageScope.dayKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolved({ identity: nextIdentity, plan: stored });
      return;
    }
    if (candidateCount === 0) return;
    const plan = stored ?? candidate;
    if (plan.blocks.length > 0) storeSessionPlan(storageScope, plan);
    pruneSessionPlans(storageScope.dayKey);
    // This state mirrors an external localStorage read; it intentionally settles
    // after the render that supplied the candidate fallback.
    setResolved({ identity: nextIdentity, plan });
  }, [args.isSessionDataReady, candidate, candidateCount, resolved?.identity, storageScope]);

  if (!storageScope) return { dailyPlan: null, streamMode: 'unbounded', planIdentity: null };
  if (!args.isSessionDataReady) {
    return { dailyPlan: null, streamMode: args.continueAnyway ? 'overflow' : 'planned', planIdentity: identity };
  }
  const dailyPlan = resolved?.identity === identity
    ? resolved.plan
    : candidateCount > 0
      ? candidate
      : null;
  return {
    dailyPlan,
    streamMode: args.continueAnyway ? 'overflow' : 'planned',
    planIdentity: dailyPlan ? planCacheIdentity(identity!, dailyPlan) : identity,
  };
}
