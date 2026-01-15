import { eq, and, lte, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  userProgress,
  type UserProgress,
  type NewUserProgress,
} from "../schema";

// Get all progress for a user
export async function getUserProgress(
  userId: string
): Promise<Record<string, UserProgress>> {
  const results = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId));

  const progressMap: Record<string, UserProgress> = {};
  for (const row of results) {
    progressMap[row.wordId] = row;
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

// Batch upsert progress
export async function batchUpsertProgress(
  progressList: Omit<NewUserProgress, "id" | "createdAt" | "updatedAt">[]
): Promise<void> {
  if (progressList.length === 0) return;

  // Insert in batches to avoid hitting limits
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
