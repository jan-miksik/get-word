import { eq, and, sql, asc } from "drizzle-orm";
import { db } from "../client";
import {
  wordLists,
  wordCategories,
  wordListItems,
  userListSubscriptions,
  type WordList,
  type WordCategory,
  type WordListItem,
} from "../schema";

/** Get all word lists available to a user (own + public). */
export async function getUserLists(userId: string): Promise<WordList[]> {
  return db
    .select()
    .from(wordLists)
    .where(
      sql`${wordLists.ownerId} = ${userId} OR ${wordLists.isPublic} = true`
    );
}

/** Get subscribed list IDs for a user. */
export async function getUserSubscribedListIds(
  userId: string
): Promise<string[]> {
  const subs = await db
    .select({ listId: userListSubscriptions.listId })
    .from(userListSubscriptions)
    .where(eq(userListSubscriptions.userId, userId));
  return subs.map((s) => s.listId);
}

/** Get categories for a list, ordered by position. */
export async function getListCategories(
  listId: string
): Promise<WordCategory[]> {
  return db
    .select()
    .from(wordCategories)
    .where(eq(wordCategories.listId, listId))
    .orderBy(asc(wordCategories.position));
}

/** Get all word_list_items for a specific list, ordered by category position then item position. */
export async function getListItems(listId: string): Promise<WordListItem[]> {
  return db
    .select()
    .from(wordListItems)
    .where(eq(wordListItems.listId, listId))
    .orderBy(asc(wordListItems.position));
}

/**
 * Get all word_list_items from all lists a user is subscribed to.
 * Only returns items where both textKnown AND textTarget are present
 * (minimum viable card rule).
 */
export async function getUserSubscribedItems(
  userId: string
): Promise<WordListItem[]> {
  const listIds = await getUserSubscribedListIds(userId);
  if (listIds.length === 0) return [];

  return db
    .select()
    .from(wordListItems)
    .where(
      sql`${wordListItems.listId} IN ${listIds} AND ${wordListItems.textKnown} IS NOT NULL AND ${wordListItems.textTarget} IS NOT NULL`
    )
    .orderBy(asc(wordListItems.position));
}

/** Get the system default list (owner_id IS NULL, is_public = true). */
export async function getSystemDefaultList(): Promise<WordList | null> {
  const results = await db
    .select()
    .from(wordLists)
    .where(
      sql`${wordLists.ownerId} IS NULL AND ${wordLists.isPublic} = true`
    )
    .limit(1);
  return results[0] ?? null;
}

/**
 * Build a mapping from old word.id (e.g. "w000") to word_list_item.id (UUID).
 * Uses the words table + word_list_items to match by textKnown (cz text).
 */
export async function getWordIdToItemIdMapping(
  listId: string
): Promise<Map<string, string>> {
  // Join words table with word_list_items by matching cz text to textKnown
  const results = await db.execute(
    sql`SELECT w.id as word_id, wli.id as item_id
        FROM words w
        JOIN word_list_items wli ON wli.text_known = w.cz AND wli.list_id = ${listId}`
  );

  const mapping = new Map<string, string>();
  for (const row of results) {
    mapping.set(row.word_id as string, row.item_id as string);
  }
  return mapping;
}
