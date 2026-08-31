import { and, eq, isNull, sql } from 'drizzle-orm';

import { hasIntroducedWord, hasStudyGoal } from '@/packages/domain/goals/goal';
import { resolveGoalTargets, resolveWordsDayTargets, sessionItemCapFromWordGoal } from '@/packages/domain/goals/calibration';
import { db } from '../client';
import { userDayStats, users } from '../schema';
import { getLocalDayActivity } from './activity-stats';
import { getUserCategoryFilters } from './category-filters';
import { getProjectedProgress } from './progress';
import { getGoalVersionForDay } from './study-goals';
import { getUserOwnListItems, getUserSubscribedItems, getUserStudyLists } from './word-list-items';

export type DayGoalSnapshot = {
  dayKey: string;
  mode: 'words' | 'minutes' | null;
  status: 'active' | 'nothing_due';
  createdAt: Date | null;
  availableNewWords: number | null;
  dueReviewCount: number | null;
  resolvedNewTarget: number | null;
  resolvedReviewTarget: number | null;
  resolvedItemBudget: number | null;
  resolvedMinutesBudget: number | null;
};

async function getEligibleCounts(userId: string, now: Date): Promise<{ availableNewWords: number; dueReviewCount: number }> {
  const [userRows, categoryFilters, subscribed, owned, lists] = await Promise.all([
    db.select({ languageFrom: users.languageFrom, languageTo: users.languageTo }).from(users).where(eq(users.id, userId)).limit(1),
    getUserCategoryFilters(userId), getUserSubscribedItems(userId), getUserOwnListItems(userId), getUserStudyLists(userId),
  ]);
  const pair = userRows[0];
  if (!pair?.languageFrom || !pair.languageTo) return { availableNewWords: 0, dueReviewCount: 0 };
  const languageByList = new Map(lists.map((list) => [list.id, list]));
  const seen = new Set<string>();
  const items = [...subscribed, ...owned].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    const list = languageByList.get(item.listId);
    return Boolean(list && list.languageFrom === pair.languageFrom && list.languageTo === pair.languageTo) &&
      (categoryFilters.length === 0 || (item.categoryId !== null && categoryFilters.includes(item.categoryId)));
  });
  const progress = await getProjectedProgress(userId, items.map((item) => ({
    id: item.id, textKnown: item.textKnown, textTarget: item.textTarget, ignoreCase: item.ignoreCase,
    languageFrom: pair.languageFrom, languageTo: pair.languageTo,
  })));
  return items.reduce((counts, item) => {
    const row = progress[item.id];
    if (!hasIntroducedWord(row)) counts.availableNewWords += 1;
    else if (row.stageIndex === 0 || (row.nextDueAt !== null && row.nextDueAt !== undefined && row.nextDueAt.getTime() <= now.getTime())) counts.dueReviewCount += 1;
    return counts;
  }, { availableNewWords: 0, dueReviewCount: 0 });
}

function toSnapshot(row: typeof userDayStats.$inferSelect): DayGoalSnapshot {
  return {
    dayKey: row.dayKey, mode: row.goalMode === 'words' || row.goalMode === 'minutes' ? row.goalMode : null,
    status: row.goalStatus === 'nothing_due' ? 'nothing_due' : 'active', createdAt: row.snapshotCreatedAt,
    availableNewWords: row.availableNewWords, dueReviewCount: row.dueReviewCount,
    resolvedNewTarget: row.resolvedNewTarget, resolvedReviewTarget: row.resolvedReviewTarget,
    resolvedItemBudget: row.resolvedItemBudget, resolvedMinutesBudget: row.resolvedMinutesBudget,
  };
}

export async function ensureDayGoalSnapshot(userId: string, dayKey: string, timezone: string): Promise<DayGoalSnapshot | null> {
  const [existing] = await db.select().from(userDayStats).where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey))).limit(1);
  if (existing?.snapshotCreatedAt) {
    // Self-heal accounts that added their first words under an older build:
    // their commit could not reopen the already-frozen 0/0 day, but the first
    // answer under this build must count against a real target.
    if (existing.goalStatus === 'nothing_due') {
      return reopenNothingDueDayGoalSnapshot(userId, dayKey, timezone);
    }
    return toSnapshot(existing);
  }
  return db.transaction(async (tx) => {
    // A unique key prevents duplicate rows; the advisory lock additionally
    // gives the winner one coherent pre-event view while it derives fields for
    // that row. Activity and review mutations otherwise routinely arrive in
    // parallel from the same foreground session.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${dayKey}))`);
    const [locked] = await tx.select().from(userDayStats)
      .where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey))).limit(1);
    if (locked?.snapshotCreatedAt) return toSnapshot(locked);
    const now = new Date();
    const [goal, counts] = await Promise.all([getGoalVersionForDay(userId, dayKey), getEligibleCounts(userId, now)]);
    if (!goal?.enabled) return null;
    const targets = resolveGoalTargets(goal);
    const wordsTargets = goal.mode === 'words'
      ? resolveWordsDayTargets(targets, counts.dueReviewCount)
      : null;
    const hasWordsContent = counts.availableNewWords > 0 || counts.dueReviewCount > 0;
    // Availability describes whether the frozen target can be reached; it must
    // not resize the target itself. Otherwise zero new words plus a handful of
    // repeats becomes a completed words day even though the learner chose a
    // daily goal measured in new words.
    const resolvedNewTarget = wordsTargets
      ? (hasWordsContent ? wordsTargets.newTarget : 0)
      : null;
    const resolvedReviewTarget = wordsTargets
      ? (hasWordsContent ? wordsTargets.reviewTarget : 0)
      : null;
    const status = goal.mode === 'words' && !hasWordsContent ? 'nothing_due' : 'active';
    const snapshotValues = {
      userId, dayKey, timezone, goalVersionId: goal.id, goalDaysPerWeek: goal.daysPerWeek,
      goalMinutes: goal.minutesPerDay, goalWords: goal.wordsPerDay, goalMode: goal.mode, goalStatus: status,
      snapshotCreatedAt: now, availableNewWords: counts.availableNewWords, dueReviewCount: counts.dueReviewCount,
      resolvedNewTarget, resolvedReviewTarget, resolvedItemBudget: targets.itemBudget,
      resolvedMinutesBudget: targets.minutesPerDay,
    };
    // `recomputeUserDayStat` may already have created the measurement row (the
    // goal summary does this before the learner's first answer). That is not a
    // goal snapshot yet: fill it under the same lock rather than letting an
    // insert conflict permanently leave the daily target undefined.
    await tx.insert(userDayStats).values(snapshotValues).onConflictDoNothing();
    await tx.update(userDayStats).set(snapshotValues).where(and(
      eq(userDayStats.userId, userId),
      eq(userDayStats.dayKey, dayKey),
      isNull(userDayStats.snapshotCreatedAt),
    ));
    const [winner] = await tx.select().from(userDayStats)
      .where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey))).limit(1);
    return winner ? toSnapshot(winner) : null;
  });
}

/**
 * Reopen today's zero-work snapshot after the learner adds study material.
 *
 * Activity tracking can legitimately claim a words day while onboarding or an
 * add-words surface is still open. With no items yet that immutable snapshot is
 * `nothing_due` and has 0/0 targets. It must stay immutable during ordinary
 * studying, but it is no longer truthful once a commit creates the first words.
 */
export async function reopenNothingDueDayGoalSnapshot(
  userId: string,
  dayKey: string,
  timezone: string,
): Promise<DayGoalSnapshot | null> {
  const [existing] = await db.select().from(userDayStats)
    .where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey)))
    .limit(1);
  if (!existing?.snapshotCreatedAt || existing.goalStatus !== 'nothing_due') {
    return existing ? toSnapshot(existing) : null;
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${dayKey}))`);
    const [locked] = await tx.select().from(userDayStats)
      .where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey)))
      .limit(1);
    if (!locked?.snapshotCreatedAt || locked.goalStatus !== 'nothing_due') {
      return locked ? toSnapshot(locked) : null;
    }

    const now = new Date();
    const [goal, counts] = await Promise.all([
      getGoalVersionForDay(userId, dayKey),
      getEligibleCounts(userId, now),
    ]);
    if (!goal?.enabled || goal.mode !== 'words') return toSnapshot(locked);
    if (counts.availableNewWords === 0 && counts.dueReviewCount === 0) {
      return toSnapshot(locked);
    }

    const targets = resolveGoalTargets(goal);
    const {
      newTarget: resolvedNewTarget,
      reviewTarget: resolvedReviewTarget,
    } = resolveWordsDayTargets(targets, counts.dueReviewCount);
    await tx.update(userDayStats).set({
      timezone,
      goalVersionId: goal.id,
      goalDaysPerWeek: goal.daysPerWeek,
      goalMinutes: goal.minutesPerDay,
      goalWords: goal.wordsPerDay,
      goalMode: goal.mode,
      goalStatus: 'active',
      snapshotCreatedAt: now,
      availableNewWords: counts.availableNewWords,
      dueReviewCount: counts.dueReviewCount,
      resolvedNewTarget,
      resolvedReviewTarget,
      resolvedItemBudget: targets.itemBudget,
      resolvedMinutesBudget: targets.minutesPerDay,
      met: false,
      computedAt: now,
    }).where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey)));

    const [updated] = await tx.select().from(userDayStats)
      .where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey)))
      .limit(1);
    return updated ? toSnapshot(updated) : null;
  });
}

export function reviewCountsTowardSnapshot(
  snapshot: DayGoalSnapshot | undefined,
  transition: { eventKind: 'introduction' | 'review'; previousDueAt: Date | null; previousStageIndex: number; introducedAt: Date },
): boolean {
  if (!snapshot?.createdAt || snapshot.mode !== 'words' || snapshot.status === 'nothing_due') return false;
  if (transition.eventKind !== 'review' || transition.introducedAt > snapshot.createdAt) return false;
  return transition.previousStageIndex === 0 || Boolean(transition.previousDueAt && transition.previousDueAt <= snapshot.createdAt);
}

export interface DayGoalMetInput {
  goalEnabled: boolean;
  mode: 'words' | 'minutes' | null;
  /** Whether `ensureDayGoalSnapshot` has frozen this day's targets yet. */
  hasWordsSnapshot: boolean;
  status: 'active' | 'nothing_due' | null;
  introducedWords: number;
  reviewedWords: number;
  resolvedNewTarget: number | null;
  resolvedReviewTarget: number | null;
  answeredWords: number;
  activeMs: number;
  minuteItemBudget: number;
  minuteBudgetMs: number;
}

/**
 * Whether a local day counts as earned.
 *
 * Words mode asks for the new words the day promised, and for the repeats that
 * were actually owed. `resolvedReviewTarget` is already
 * `min(budget left after new words, repeats genuinely due)`, so a learner with
 * nothing to repeat has a target of zero and earns the day on new words alone —
 * while a learner sitting on a backlog has to work through the share of it the
 * day was sized for. Neither number moves after the snapshot, so a goal or
 * pacing change cannot retroactively earn or un-earn a day.
 *
 * Minutes mode keeps the older rule it was built with: the session length, or
 * the clock as the safety net for someone who has not got that many words.
 */
export function isDayGoalMet(input: DayGoalMetInput): boolean {
  if (!input.goalEnabled) return false;
  if (input.mode === 'words') {
    // Targets are null until the snapshot exists; treating that as zero would
    // earn the day without any study at all.
    if (!input.hasWordsSnapshot || input.status === 'nothing_due') return false;
    return input.introducedWords >= (input.resolvedNewTarget ?? 0) &&
      input.reviewedWords >= (input.resolvedReviewTarget ?? 0);
  }
  return input.answeredWords >= input.minuteItemBudget || input.activeMs >= input.minuteBudgetMs;
}

export async function recomputeUserDayStat(userId: string, dayKey: string, timezone: string): Promise<void> {
  const [existingRows, goal, activity, reviewRows] = await Promise.all([
    db.select().from(userDayStats).where(and(eq(userDayStats.userId, userId), eq(userDayStats.dayKey, dayKey))).limit(1),
    getGoalVersionForDay(userId, dayKey), getLocalDayActivity(userId, timezone, dayKey, dayKey),
    db.execute(sql`
      SELECT count(DISTINCT coalesce(word_list_item_id::text, word_id))::int AS words,
             count(DISTINCT coalesce(word_list_item_id::text, word_id)) FILTER (WHERE event_kind = 'introduction')::int AS introductions,
             count(DISTINCT coalesce(word_list_item_id::text, word_id)) FILTER (WHERE counts_toward_daily_review = true)::int AS reviews,
             min(client_created_at) AS first_activity_at, max(client_created_at) AS last_activity_at
      FROM review_events WHERE user_id = ${userId}::uuid
        AND coalesce(local_day_key::text, (client_created_at AT TIME ZONE ${timezone})::date::text) = ${dayKey}`),
  ]);
  const existing = existingRows[0];
  const review = (reviewRows as unknown as Record<string, unknown>[])[0] ?? {};
  const activeMs = activity[0]?.creditedMs ?? 0;
  const answeredWords = Number(review.words ?? 0);
  const introducedWords = Number(review.introductions ?? 0);
  const reviewedWords = Number(review.reviews ?? 0);
  // A words-mode row created by a summary refresh is only a measurement
  // placeholder until ensureDayGoalSnapshot freezes its targets. Treating its
  // null targets as zero would otherwise earn the day without any study.
  const isWords = existing?.goalMode === 'words' || (!existing && goal?.mode === 'words');
  const hasWordsSnapshot = isWords && existing?.snapshotCreatedAt !== null && existing?.snapshotCreatedAt !== undefined;
  // Builds before the target/availability distinction capped this field at
  // `availableNewWords`. Repair those snapshots while the rolling summary is
  // already self-healing the day, including clearing an incorrectly sticky
  // `met` verdict from a repeats-only session.
  const canonicalWordsTargets = isWords && hasWordsSnapshot && existing?.goalStatus !== 'nothing_due' && goal?.mode === 'words'
    ? resolveWordsDayTargets(
        resolveGoalTargets(goal),
        existing?.dueReviewCount ?? 0,
      )
    : null;
  const repairsUndersizedNewTarget = Boolean(
    canonicalWordsTargets &&
    (existing?.resolvedNewTarget ?? 0) < canonicalWordsTargets.newTarget,
  );
  const resolvedNewTarget = repairsUndersizedNewTarget
    ? canonicalWordsTargets!.newTarget
    : existing?.resolvedNewTarget ?? null;
  // Minutes days retain the old frozen planner/met rule. A later pacing or
  // goal change must not resize a day that already has a stats row.
  const minuteItemBudget = sessionItemCapFromWordGoal(existing?.goalWords ?? goal?.wordsPerDay ?? 0);
  const minuteBudgetMs = (existing?.goalMinutes ?? goal?.minutesPerDay ?? 0) * 60_000;
  const met = isDayGoalMet({
    goalEnabled: hasStudyGoal(goal) && goal !== null,
    mode: isWords ? 'words' : 'minutes',
    hasWordsSnapshot,
    status: existing?.goalStatus === 'nothing_due' ? 'nothing_due' : 'active',
    introducedWords,
    reviewedWords,
    resolvedNewTarget,
    resolvedReviewTarget: existing?.resolvedReviewTarget ?? null,
    answeredWords,
    activeMs,
    minuteItemBudget,
    minuteBudgetMs,
  });
  const firstActivityAt = review.first_activity_at ? new Date(String(review.first_activity_at)) : null;
  const lastActivityAt = review.last_activity_at ? new Date(String(review.last_activity_at)) : null;
  await db.insert(userDayStats).values({
    userId, dayKey, timezone, activeMs, answeredWords, introducedWords, reviewedWords,
    goalVersionId: goal?.id ?? null, goalDaysPerWeek: goal?.daysPerWeek ?? null,
    goalMinutes: goal?.minutesPerDay ?? null, goalWords: goal?.wordsPerDay ?? null, goalMode: goal?.mode ?? null,
    resolvedNewTarget, met, firstActivityAt, lastActivityAt, computedAt: new Date(),
  }).onConflictDoUpdate({ target: [userDayStats.userId, userDayStats.dayKey], set: {
    activeMs, answeredWords, introducedWords, reviewedWords,
    resolvedNewTarget: repairsUndersizedNewTarget
      ? resolvedNewTarget
      : sql`${userDayStats.resolvedNewTarget}`,
    met: repairsUndersizedNewTarget ? met : sql`${userDayStats.met} OR ${met}`,
    // Use the typed INSERT values. Passing a Date directly through a raw SQL
    // interpolation gives postgres-js a `text` parameter, and Postgres cannot
    // resolve `least(timestamptz, text)` / `greatest(timestamptz, text)`. That
    // made every recompute with real activity fail after it had already
    // correctly derived 20 introductions and `met = true`, leaving the stale
    // five-word row visible forever.
    firstActivityAt: sql`least(${userDayStats.firstActivityAt}, excluded.first_activity_at)`,
    lastActivityAt: sql`greatest(${userDayStats.lastActivityAt}, excluded.last_activity_at)`,
    computedAt: sql`excluded.computed_at`,
  }});
}

export async function getUserDayStats(userId: string, fromDay: string, toDay: string) {
  return db.select().from(userDayStats).where(and(eq(userDayStats.userId, userId), sql`${userDayStats.dayKey} >= ${fromDay}`, sql`${userDayStats.dayKey} <= ${toDay}`)).orderBy(userDayStats.dayKey);
}
