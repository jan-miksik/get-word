'use client';

import { useEffect, useMemo, useState } from 'react';

import { getBestKnownDayActiveMs, seedActivityDayTotal } from '@/lib/activity/runtime';
import type { GoalSummary } from '@/packages/contracts/src/goals';
import { estimateSecondsPerItem } from '@/packages/domain/goals/calibration';
import type { StudyGoalVersion, StudyPacing } from '@/packages/domain/goals/goal';

type GoalDay = GoalSummary['days'][number];

/** Below three answers the observed pace is noise, not a pace. */
const PACE_WARMUP_ANSWERS = 3;
/** How many answers it takes for the learner's own pace to fully take over. */
const PACE_FULL_WEIGHT_ANSWERS = 10;
/** A single item cannot honestly take less than this or more than this. */
const MIN_SECONDS_PER_ITEM = 1;
const MAX_SECONDS_PER_ITEM = 120;

export interface StudyCountdown {
  /** Active study time recorded today. */
  activeMs: number;
  /** What the day was planned to cost, from the goal's frozen pacing. */
  budgetMs: number;
  /** How much longer the remaining cards should take at the learner's own pace. */
  remainingWorkMs: number;
  /** How much of the planned budget is left on the clock. */
  remainingBudgetMs: number;
  projectedTotalMs: number;
  /** Positive means the day will overrun its plan. */
  deltaMs: number;
  isOnPace: boolean;
  /** The blend of the pacing estimate and what today actually costs. */
  secondsPerItem: number;
  itemsDone: number;
  itemsTotal: number;
  remainingItems: number;
  progress: number;
}

/** `m:ss`; shared by the session strip and the day's closing line. */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * How long the rest of today should take.
 *
 * The budget is the *plan*: the frozen pacing snapshot the session was sized
 * with, so it does not move under the learner mid-day. The remaining work is
 * *reality*: the same estimate corrected by how fast this session is actually
 * going. Keeping the two apart is what lets the strip say "ahead" or "behind"
 * instead of just counting.
 */
export function useStudyCountdown(
  day: GoalDay | null,
  goal: StudyGoalVersion | null,
  enabled: boolean,
): StudyCountdown {
  const dayKey = day?.dayKey;
  const serverActiveMs = day?.activeMs;
  const [activeMs, setActiveMs] = useState(() => serverActiveMs ?? 0);

  useEffect(() => {
    if (!dayKey || serverActiveMs === undefined) return;
    seedActivityDayTotal(dayKey, serverActiveMs);
  }, [dayKey, serverActiveMs]);

  useEffect(() => {
    if (!enabled || !dayKey) return;
    const update = () => setActiveMs(getBestKnownDayActiveMs(dayKey));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [dayKey, enabled]);

  return useMemo(() => {
    const isWords = (day?.goalMode ?? goal?.mode) === 'words';
    const itemsTotal = isWords
      ? (day?.resolvedNewTarget ?? 0) + (day?.resolvedReviewTarget ?? 0)
      : day?.resolvedItemBudget ?? 0;
    const itemsDone = isWords
      ? (day?.introducedWords ?? 0) + (day?.reviewedWords ?? 0)
      : day?.answeredWords ?? 0;
    const remainingItems = Math.max(0, itemsTotal - itemsDone);

    // The pacing snapshot travels with the goal version, so a Fine Tune change
    // made today cannot rewrite the budget of a day already under way.
    const staticSeconds = clamp(
      estimateSecondsPerItem((goal?.pacing ?? undefined) as StudyPacing),
      MIN_SECONDS_PER_ITEM,
      MAX_SECONDS_PER_ITEM,
    );
    const answered = day?.answeredWords ?? 0;
    const observedWeight = answered < PACE_WARMUP_ANSWERS
      ? 0
      : Math.min(1, (answered - (PACE_WARMUP_ANSWERS - 1)) / (PACE_FULL_WEIGHT_ANSWERS - (PACE_WARMUP_ANSWERS - 1)));
    const observedSeconds = answered > 0
      ? clamp(activeMs / 1000 / answered, MIN_SECONDS_PER_ITEM, MAX_SECONDS_PER_ITEM)
      : staticSeconds;
    const secondsPerItem = staticSeconds * (1 - observedWeight) + observedSeconds * observedWeight;

    const budgetMs = isWords
      ? itemsTotal * staticSeconds * 1000
      : (day?.resolvedMinutesBudget ?? day?.goalMinutes ?? 0) * 60_000;
    const remainingWorkMs = remainingItems * secondsPerItem * 1000;
    const projectedTotalMs = activeMs + remainingWorkMs;

    return {
      activeMs,
      budgetMs,
      remainingWorkMs,
      remainingBudgetMs: Math.max(0, budgetMs - activeMs),
      projectedTotalMs,
      deltaMs: projectedTotalMs - budgetMs,
      isOnPace: projectedTotalMs - budgetMs <= 0,
      secondsPerItem,
      itemsDone,
      itemsTotal,
      remainingItems,
      progress: itemsTotal > 0 ? clamp(itemsDone / itemsTotal, 0, 1) : 0,
    };
  }, [activeMs, day, goal]);
}
