import { eq, and, lte, or, sql, isNull, gt } from "drizzle-orm";
import { db } from "../client";
import {
  userProgress,
  type UserProgress,
  type NewUserProgress,
} from "../schema";
import { STAGES } from "@/lib/words";

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
  wordId: string
): Promise<UserProgress | null> {
  const results = await db
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
  wordListItemId: string
): Promise<UserProgress | null> {
  const results = await db
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

// Batch upsert progress (legacy: conflicts on userId + wordId)
export async function batchUpsertProgress(
  progressList: Omit<NewUserProgress, "id" | "createdAt" | "updatedAt">[]
): Promise<void> {
  if (progressList.length === 0) return;

  const BATCH_SIZE = 100;

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const batch = progressList.slice(i, i + BATCH_SIZE);

    await db
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
          updatedAt: new Date(),
        },
      });
  }
}

// Batch upsert progress by wordListItemId (new path)
export async function batchUpsertProgressByItemId(
  progressList: Omit<NewUserProgress, "id" | "createdAt" | "updatedAt">[]
): Promise<void> {
  if (progressList.length === 0) return;

  const BATCH_SIZE = 100;

  for (let i = 0; i < progressList.length; i += BATCH_SIZE) {
    const batch = progressList.slice(i, i + BATCH_SIZE);

    await db
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
          updatedAt: new Date(),
        },
      });
  }
}

export type ReviewProgressAction = "known" | "really_known" | "unknown";

export async function applyReviewEventToProgress(args: {
  userId: string;
  wordId?: string | null;
  wordListItemId?: string | null;
  action: ReviewProgressAction;
  occurredAt: Date;
}): Promise<void> {
  const { userId, wordId, wordListItemId, action, occurredAt } = args;
  if (!wordId && !wordListItemId) return;

  const current = wordListItemId
    ? await getWordProgressByItemId(userId, wordListItemId)
    : await getWordProgress(userId, wordId!);

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
    await batchUpsertProgressByItemId([values]);
  } else {
    await batchUpsertProgress([values]);
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
