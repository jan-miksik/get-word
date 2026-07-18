import { eq, and, sql, gt, isNull, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  userMemoryHooks,
  type UserMemoryHook,
} from "../schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Get all memory hooks for a user, excluding soft-deleted rows. Used by full
 * snapshot fetches where deleted rows would just be noise.
 */
export async function getUserMemoryHooks(
  userId: string
): Promise<Record<string, string>> {
  const results = await db
    .select()
    .from(userMemoryHooks)
    .where(and(eq(userMemoryHooks.userId, userId), isNull(userMemoryHooks.deletedAt)));

  const hooksMap: Record<string, string> = {};
  for (const row of results) {
    const key = row.wordListItemId ?? row.wordId;
    if (key) hooksMap[key] = row.hookText;
  }
  return hooksMap;
}

/**
 * Delta fetch: return rows whose updatedAt > since, INCLUDING soft-deleted
 * tombstones. The client filters by deletedAt to know which keys to drop.
 */
export async function getUserMemoryHooksDelta(
  userId: string,
  since: Date
): Promise<Array<{ key: string; hookText: string; deletedAt: Date | null }>> {
  const results = await db
    .select()
    .from(userMemoryHooks)
    .where(and(eq(userMemoryHooks.userId, userId), gt(userMemoryHooks.updatedAt, since)));

  const out: Array<{ key: string; hookText: string; deletedAt: Date | null }> = [];
  for (const row of results) {
    const key = row.wordListItemId ?? row.wordId;
    if (!key) continue;
    out.push({ key, hookText: row.hookText, deletedAt: row.deletedAt ?? null });
  }
  return out;
}

// Upsert memory hook. Clears any prior soft-delete tombstone so a re-create
// after delete reuses the existing row.
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
        deletedAt: null,
      },
    })
    .returning();
  return results[0];
}

// Upsert memory hook for a list item
export async function upsertMemoryHookByItemId(
  userId: string,
  wordListItemId: string,
  hookText: string
): Promise<UserMemoryHook> {
  const results = await db
    .insert(userMemoryHooks)
    .values({ userId, wordListItemId, hookText })
    .onConflictDoUpdate({
      target: [userMemoryHooks.userId, userMemoryHooks.wordListItemId],
      set: {
        hookText,
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();
  return results[0];
}

/**
 * Soft-delete a memory hook by setting deletedAt and bumping updatedAt so
 * delta clients pick up the tombstone. The row stays in the table for LWW
 * arbitration; compaction can hard-delete old tombstones later.
 */
export async function deleteMemoryHook(
  userId: string,
  wordId: string
): Promise<boolean> {
  const now = new Date();
  const results = await db
    .update(userMemoryHooks)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(userMemoryHooks.userId, userId),
        eq(userMemoryHooks.wordId, wordId),
        isNull(userMemoryHooks.deletedAt)
      )
    )
    .returning();
  return results.length > 0;
}

// Soft-delete memory hook for a list item
export async function deleteMemoryHookByItemId(
  userId: string,
  wordListItemId: string
): Promise<boolean> {
  const now = new Date();
  const results = await db
    .update(userMemoryHooks)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(userMemoryHooks.userId, userId),
        eq(userMemoryHooks.wordListItemId, wordListItemId),
        isNull(userMemoryHooks.deletedAt)
      )
    )
    .returning();
  return results.length > 0;
}

/**
 * Bulk soft-delete every live hook attached to the given items, across all
 * users. Used when items are removed without a surviving twin to rewire to.
 * Soft-deleting (rather than relying on the FK cascade) tombstones each row so
 * delta-sync clients drop their cached hooks instead of keeping a stale one
 * that points at a now-deleted word.
 */
export async function softDeleteHooksForItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const now = new Date();
  await db
    .update(userMemoryHooks)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        inArray(userMemoryHooks.wordListItemId, itemIds),
        isNull(userMemoryHooks.deletedAt)
      )
    );
}

/**
 * Rewire memory hooks from a duplicate item onto the surviving twin before the
 * duplicate is deleted, so no learner loses their mnemonic.
 *
 * For each user with a live hook on `fromItemId`:
 *  - if they have no live hook on `toItemId` (or theirs there is older), the
 *    duplicate's hook text wins and is upserted onto the survivor (reviving a
 *    tombstoned survivor row if needed);
 *  - if their survivor hook is newer, it is kept untouched (last-writer-wins).
 * Either way the duplicate's hook is then soft-deleted so its `wordListItemId`
 * key tombstones for delta sync.
 *
 * Done as two operations (upsert survivor + soft-delete source) rather than a
 * raw repoint UPDATE, because the unique (userId, wordListItemId) constraint
 * counts tombstoned rows, and a raw update would leave the source key with no
 * tombstone for clients to drop.
 */
export async function mergeHooksToSurvivor(
  fromItemId: string,
  toItemId: string
): Promise<void> {
  if (fromItemId === toItemId) return;
  const now = new Date();

  const fromHooks = await db
    .select()
    .from(userMemoryHooks)
    .where(
      and(
        eq(userMemoryHooks.wordListItemId, fromItemId),
        isNull(userMemoryHooks.deletedAt)
      )
    );
  if (fromHooks.length === 0) return;

  // Include tombstoned survivor rows: the unique constraint counts them, so we
  // must reconcile against them too.
  const survivorHooks = await db
    .select()
    .from(userMemoryHooks)
    .where(eq(userMemoryHooks.wordListItemId, toItemId));
  const survivorByUser = new Map(survivorHooks.map((hook) => [hook.userId, hook]));

  for (const from of fromHooks) {
    const existing = survivorByUser.get(from.userId);
    const existingIsLive = Boolean(existing && existing.deletedAt === null);
    // LWW: the duplicate's hook wins when the survivor has no live hook, or the
    // duplicate's hook was updated more recently.
    const fromWins = !existingIsLive || from.updatedAt > existing!.updatedAt;

    if (fromWins) {
      await db
        .insert(userMemoryHooks)
        .values({
          userId: from.userId,
          wordListItemId: toItemId,
          hookText: from.hookText,
        })
        .onConflictDoUpdate({
          target: [userMemoryHooks.userId, userMemoryHooks.wordListItemId],
          set: { hookText: from.hookText, updatedAt: now, deletedAt: null },
        });
    }

    await db
      .update(userMemoryHooks)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(userMemoryHooks.id, from.id));
  }
}

// Batch upsert memory hooks
export async function batchUpsertMemoryHooks(
  userId: string,
  hooks: Record<string, string>
): Promise<void> {
  const entries = Object.entries(hooks);
  if (entries.length === 0) return;

  const legacyValues = entries
    .filter(([key]) => !UUID_PATTERN.test(key))
    .map(([wordId, hookText]) => ({
      userId,
      wordId,
      hookText,
    }));
  const itemValues = entries
    .filter(([key]) => UUID_PATTERN.test(key))
    .map(([wordListItemId, hookText]) => ({
      userId,
      wordListItemId,
      hookText,
    }));

  // Insert in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < legacyValues.length; i += BATCH_SIZE) {
    const batch = legacyValues.slice(i, i + BATCH_SIZE);

    await db
      .insert(userMemoryHooks)
      .values(batch)
      .onConflictDoUpdate({
        target: [userMemoryHooks.userId, userMemoryHooks.wordId],
        set: {
          hookText: sql`excluded.hook_text`,
          updatedAt: new Date(),
          deletedAt: null,
        },
      });
  }

  for (let i = 0; i < itemValues.length; i += BATCH_SIZE) {
    const batch = itemValues.slice(i, i + BATCH_SIZE);

    await db
      .insert(userMemoryHooks)
      .values(batch)
      .onConflictDoUpdate({
        target: [userMemoryHooks.userId, userMemoryHooks.wordListItemId],
        set: {
          hookText: sql`excluded.hook_text`,
          updatedAt: new Date(),
          deletedAt: null,
        },
      });
  }
}
