import { eq, max } from "drizzle-orm";
import { db } from "../client";
import { userMemoryHooks, userProgress, users } from "../schema";

/**
 * Returns the max(updatedAt) across the user's mutable rows. Used as the
 * `sync_revision` cursor in /api/sync responses so clients can ask
 * `?since=<this>` next time and only receive rows that changed afterwards.
 *
 * Category filters have no updatedAt column, so they're handled with
 * set-replace semantics on every delta — they don't influence the cursor.
 */
export async function getUserSyncRevision(userId: string): Promise<number> {
  const [userRow, progressRow, hookRow] = await Promise.all([
    db
      .select({ updatedAt: users.updatedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ value: max(userProgress.updatedAt) })
      .from(userProgress)
      .where(eq(userProgress.userId, userId)),
    db
      .select({ value: max(userMemoryHooks.updatedAt) })
      .from(userMemoryHooks)
      .where(eq(userMemoryHooks.userId, userId)),
  ]);

  const candidates = [
    userRow[0]?.updatedAt,
    progressRow[0]?.value,
    hookRow[0]?.value,
  ]
    .filter((d): d is Date => d instanceof Date)
    .map((d) => d.getTime());

  return candidates.length > 0 ? Math.max(...candidates) : Date.now();
}
