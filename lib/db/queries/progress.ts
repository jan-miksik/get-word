import { eq, and, lte, or, sql, isNull, gt } from "drizzle-orm";
import { db } from "../client";
import {
  userProgress,
  type UserProgress,
  type NewUserProgress,
} from "../schema";
import { STAGES } from "@/lib/words";

/**
 * Either the top-level `db` instance or a transaction handle from
 * `db.transaction(...)`. Both expose the methods (insert / select / etc.) we
 * use here, so callers can opt into running a query inside a transaction
 * without the query helpers having to know which one they got. We derive the
 * transaction-handle type from drizzle's own callback signature to stay in
 * sync with the installed version.
 */
type TxHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | TxHandle;

/**
 * Get all progress for a user, keyed by wordListItemId (preferred) or wordId (legacy).
 * Excludes archived entries. When `since` is provided, returns only rows whose
 * updatedAt is strictly greater than the cursor (delta fetch path).
 */
export async function getUserProgress(
  userId: string,
  options?: { since?: Date }
): Promise<Record<string, UserProgress>> {
  const conditions = [eq(userProgress.userId, userId), isNull(userProgress.archivedAt)];
  if (options?.since) {
    conditions.push(gt(userProgress.updatedAt, options.since));
  }
  const results = await db
    .select()
    .from(userProgress)
    .where(and(...conditions));

  const progressMap: Record<string, UserProgress> = {};
  for (const row of results) {
    // Key by wordListItemId (new) with wordId fallback (legacy)
    const key = row.wordListItemId ?? row.wordId;
    if (key) {
      progressMap[key] = row;
    }
  }
  return progressMap;
}

// Get progress for a specific word
export async function getWordProgress(
  userId: string,
  wordId: string,
  executor: Executor = db
): Promise<UserProgress | null> {
  const results = await executor
    .select()
    .from(userProgress)
    .where(
      and(eq(userProgress.userId, userId), eq(userProgress.wordId, wordId))
    )
    .limit(1);
  return results[0] || null;
}

export async function getWordProgressByItemId(
  userId: string,
  wordListItemId: string,
  executor: Executor = db
): Promise<UserProgress | null> {
  const results = await executor
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(userProgress.wordListItemId, wordListItemId)
      )
    )
    .limit(1);
  return results[0] || null;
}

// Get due words for a user (for spaced repetition)
export async function getDueWords(userId: string): Promise<UserProgress[]> {
  const now = new Date();
  return db
    .select()
    .from(userProgress)
    .where(
      and(
        eq(userProgress.userId, userId),
        or(
          eq(userProgress.stageIndex, 0), // New words are always due
          lte(userProgress.nextDueAt, now) // Or words past their due date
        )
      )
    );
}

// Upsert progress for a word
export async function upsertProgress(
  progress: Omit<NewUserProgress, "id" | "createdAt" | "updatedAt">
): Promise<UserProgress> {
  const results = await db
    .insert(userProgress)
    .values(progress)
    .onConflictDoUpdate({
      target: [userProgress.userId, userProgress.wordId],
      set: {
        stageIndex: progress.stageIndex,
        knownCount: progress.knownCount,
        unknownCount: progress.unknownCount,
        lastKnownAt: progress.lastKnownAt,
        lastUnknownAt: progress.lastUnknownAt,
        nextDueAt: progress.nextDueAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return results[0];
}

/**
 * Options controlling how `batchUpsertProgress*` reconciles with existing
 * rows.
 *
 * When `lww: true`, the upsert only overwrites an existing row if the
 * incoming `updatedAt` is strictly newer. Callers must populate `updatedAt`
 * on every input (typically from the client's wall-clock). This is the right
 * mode for client-originated writes (`setCustomStage`, drag interactions)
 * where a stale outbox replay could otherwise clobber fresher state from
 * another tab or device.
 *
 * When `lww` is unset/false, the upsert overwrites unconditionally and stamps
 * `updatedAt = now()` server-side. This is the right mode for server-driven
 * writes (event-sourced `applyReviewEventToProgress`) where the row's prior
 * state has already been folded into the new values inside a transaction —
 * the new write is, by construction, the freshest truth.
 */
type UpsertOptions = { lww?: boolean };

function progressLwwSetWhere() {
  return sql`excluded.updated_at > CASE
    WHEN ${userProgress.lastKnownAt} IS NULL AND ${userProgress.lastUnknownAt} IS NULL
      THEN ${userProgress.updatedAt}
    ELSE GREATEST(
      COALESCE(${userProgress.lastKnownAt}, 'epoch'::timestamp),
      COALESCE(${userProgress.lastUnknownAt}, 'epoch'::timestamp)
    )
  END`;
}

// Batch upsert progress (legacy: conflicts on userId + wordId)
export async function batchUpsertProgress(
  progressList: Omit<NewUserProgress, "id" | "createdAt">[],
  executor: Executor = db,
  options: UpsertOptions = {}
): Promise<void> {
  if (progressList.length === 0) return;

  const BATCH_SIZE = 100;
  const lww = options.lww === true;

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const batch = progressList.slice(i, i + BATCH_SIZE);

    await executor
      .insert(userProgress)
      .values(batch)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.wordId],
        set: {
          stageIndex: sql`excluded.stage_index`,
          knownCount: sql`excluded.known_count`,
          unknownCount: sql`excluded.unknown_count`,
          lastKnownAt: sql`excluded.last_known_at`,
          lastUnknownAt: sql`excluded.last_unknown_at`,
          nextDueAt: sql`excluded.next_due_at`,
          updatedAt: lww ? sql`excluded.updated_at` : new Date(),
        },
        ...(lww
          ? { setWhere: progressLwwSetWhere() }
          : {}),
      });
  }
}

// Batch upsert progress by wordListItemId (new path)
export async function batchUpsertProgressByItemId(
  progressList: Omit<NewUserProgress, "id" | "createdAt">[],
  executor: Executor = db,
  options: UpsertOptions = {}
): Promise<void> {
  if (progressList.length === 0) return;

  const BATCH_SIZE = 100;
  const lww = options.lww === true;

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const batch = progressList.slice(i, i + BATCH_SIZE);

    await executor
      .insert(userProgress)
      .values(batch)
      .onConflictDoUpdate({
        target: [userProgress.userId, userProgress.wordListItemId],
        set: {
          stageIndex: sql`excluded.stage_index`,
          knownCount: sql`excluded.known_count`,
          unknownCount: sql`excluded.unknown_count`,
          lastKnownAt: sql`excluded.last_known_at`,
          lastUnknownAt: sql`excluded.last_unknown_at`,
          nextDueAt: sql`excluded.next_due_at`,
          updatedAt: lww ? sql`excluded.updated_at` : new Date(),
        },
        ...(lww
          ? { setWhere: progressLwwSetWhere() }
          : {}),
      });
  }
}

export type ReviewProgressAction = "known" | "really_known" | "unknown";

export async function applyReviewEventToProgress(
  args: {
    userId: string;
    wordId?: string | null;
    wordListItemId?: string | null;
    action: ReviewProgressAction;
    occurredAt: Date;
  },
  executor: Executor = db
): Promise<void> {
  const { userId, wordId, wordListItemId, action, occurredAt } = args;
  if (!wordId && !wordListItemId) return;

  const current = wordListItemId
    ? await getWordProgressByItemId(userId, wordListItemId, executor)
    : await getWordProgress(userId, wordId!, executor);

  const currentStageIndex = current?.stageIndex ?? 0;
  const knownCount = current?.knownCount ?? 0;
  const unknownCount = current?.unknownCount ?? 0;

  let stageIndex = currentStageIndex;
  let nextKnownCount = knownCount;
  let nextUnknownCount = unknownCount;
  let lastKnownAt = current?.lastKnownAt ?? null;
  let lastUnknownAt = current?.lastUnknownAt ?? null;

  if (action === "known") {
    stageIndex = Math.min(currentStageIndex + 1, STAGES.length - 1);
    nextKnownCount += 1;
    lastKnownAt = occurredAt;
  } else if (action === "really_known") {
    stageIndex = Math.min(currentStageIndex + 2, STAGES.length - 1);
    nextKnownCount += 1;
    lastKnownAt = occurredAt;
  } else {
    stageIndex = Math.max(currentStageIndex - 1, 0);
    nextUnknownCount += 1;
    lastUnknownAt = occurredAt;
  }

  const intervalMs = STAGES[stageIndex]?.intervalMs ?? 0;
  const nextDueAt = intervalMs > 0
    ? new Date(occurredAt.getTime() + intervalMs)
    : null;

  const values = {
    userId,
    wordId: wordListItemId ? null : wordId!,
    wordListItemId: wordListItemId ?? null,
    stageIndex,
    knownCount: nextKnownCount,
    unknownCount: nextUnknownCount,
    lastKnownAt,
    lastUnknownAt,
    nextDueAt,
  };

  if (wordListItemId) {
    await batchUpsertProgressByItemId([values], executor);
  } else {
    await batchUpsertProgress([values], executor);
  }
}

// Delete progress for a word
export async function deleteProgress(
  userId: string,
  wordId: string
): Promise<boolean> {
  const results = await db
    .delete(userProgress)
    .where(
      and(eq(userProgress.userId, userId), eq(userProgress.wordId, wordId))
    )
    .returning();
  return results.length > 0;
}

// Reset all progress for a user
export async function resetUserProgress(userId: string): Promise<number> {
  const results = await db
    .delete(userProgress)
    .where(eq(userProgress.userId, userId))
    .returning();
  return results.length;
}
