import { eq, and } from "drizzle-orm";
import { db } from "../client";
import {
  userMemoryHooks,
  type UserMemoryHook,
  type NewUserMemoryHook,
} from "../schema";

// Get all memory hooks for a user
export async function getUserMemoryHooks(
  userId: string
): Promise<Record<string, string>> {
  const results = await db
    .select()
    .from(userMemoryHooks)
    .where(eq(userMemoryHooks.userId, userId));

  const hooksMap: Record<string, string> = {};
  for (const row of results) {
    hooksMap[row.wordId] = row.hookText;
  }
  return hooksMap;
}

// Get memory hook for a specific word
export async function getWordMemoryHook(
  userId: string,
  wordId: string
): Promise<string | null> {
  const results = await db
    .select()
    .from(userMemoryHooks)
    .where(
      and(
        eq(userMemoryHooks.userId, userId),
        eq(userMemoryHooks.wordId, wordId)
      )
    )
    .limit(1);
  return results[0]?.hookText || null;
}

// Upsert memory hook
export async function upsertMemoryHook(
  userId: string,
  wordId: string,
  hookText: string
): Promise<UserMemoryHook> {
  const results = await db
    .insert(userMemoryHooks)
    .values({ userId, wordId, hookText })
    .onConflictDoUpdate({
      target: [userMemoryHooks.userId, userMemoryHooks.wordId],
      set: {
        hookText,
        updatedAt: new Date(),
      },
    })
    .returning();
  return results[0];
}

// Delete memory hook
export async function deleteMemoryHook(
  userId: string,
  wordId: string
): Promise<boolean> {
  const results = await db
    .delete(userMemoryHooks)
    .where(
      and(
        eq(userMemoryHooks.userId, userId),
        eq(userMemoryHooks.wordId, wordId)
      )
    )
    .returning();
  return results.length > 0;
}

// Batch upsert memory hooks
export async function batchUpsertMemoryHooks(
  userId: string,
  hooks: Record<string, string>
): Promise<void> {
  const entries = Object.entries(hooks);
  if (entries.length === 0) return;

  const values = entries.map(([wordId, hookText]) => ({
    userId,
    wordId,
    hookText,
  }));

  // Insert in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);

    await db
      .insert(userMemoryHooks)
      .values(batch)
      .onConflictDoUpdate({
        target: [userMemoryHooks.userId, userMemoryHooks.wordId],
        set: {
          hookText: userMemoryHooks.hookText,
          updatedAt: new Date(),
        },
      });
  }
}
