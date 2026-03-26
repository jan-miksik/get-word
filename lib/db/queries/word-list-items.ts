import { eq, and, sql, asc, max, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  wordLists,
  wordCategories,
  wordListItems,
  userListSubscriptions,
  userProgress,
  type WordList,
  type NewWordList,
  type WordCategory,
  type NewWordCategory,
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

/** Create a new word list. */
export async function createList(data: NewWordList): Promise<WordList> {
  const [list] = await db.insert(wordLists).values(data).returning();
  return list;
}

/** Update a word list (name, description, isPublic). Owner only — caller must verify. */
export async function updateList(
  listId: string,
  data: Partial<Pick<WordList, "name" | "description" | "isPublic">>
): Promise<WordList | null> {
  const [updated] = await db
    .update(wordLists)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(wordLists.id, listId))
    .returning();
  return updated ?? null;
}

/** Delete a word list. Cascades to categories and items via FK. */
export async function deleteList(listId: string): Promise<boolean> {
  const result = await db
    .delete(wordLists)
    .where(eq(wordLists.id, listId))
    .returning({ id: wordLists.id });
  return result.length > 0;
}

/** Get a word list by ID. */
export async function getListById(listId: string): Promise<WordList | null> {
  const [list] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.id, listId))
    .limit(1);
  return list ?? null;
}

/** Create a new category in a list. Position defaults to max+1. */
export async function createCategory(
  listId: string,
  name: string,
  isSystem = false
): Promise<WordCategory> {
  const [maxPos] = await db
    .select({ maxPosition: max(wordCategories.position) })
    .from(wordCategories)
    .where(eq(wordCategories.listId, listId));
  const position = (maxPos?.maxPosition ?? -1) + 1;

  const [cat] = await db
    .insert(wordCategories)
    .values({ listId, name, position, isSystem })
    .returning();
  return cat;
}

/** Reorder categories by updating positions from an ordered array of IDs. */
export async function reorderCategories(
  listId: string,
  orderedIds: string[]
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(wordCategories)
      .set({ position: i })
      .where(
        and(
          eq(wordCategories.id, orderedIds[i]),
          eq(wordCategories.listId, listId)
        )
      );
  }
}

/** Delete a category. Items with this categoryId get categoryId set to null (FK onDelete: set null). */
export async function deleteCategory(
  listId: string,
  categoryId: string
): Promise<boolean> {
  const result = await db
    .delete(wordCategories)
    .where(
      and(
        eq(wordCategories.id, categoryId),
        eq(wordCategories.listId, listId)
      )
    )
    .returning({ id: wordCategories.id });
  return result.length > 0;
}

/** Get items in a specific category, ordered by position. */
export async function getCategoryItems(
  listId: string,
  categoryId: string,
): Promise<WordListItem[]> {
  return db
    .select()
    .from(wordListItems)
    .where(
      and(
        eq(wordListItems.listId, listId),
        eq(wordListItems.categoryId, categoryId),
      ),
    )
    .orderBy(asc(wordListItems.position));
}

/** Create multiple word_list_items in a category. Returns created items. */
export async function createItems(
  items: {
    listId: string;
    categoryId: string;
    textKnown: string;
    textTarget: string | null;
    position: number;
    translationStatus?: "manual" | "pending" | "translated" | "failed";
  }[],
): Promise<WordListItem[]> {
  if (items.length === 0) return [];
  return db
    .insert(wordListItems)
    .values(
      items.map((item) => ({
        listId: item.listId,
        categoryId: item.categoryId,
        textKnown: item.textKnown,
        textTarget: item.textTarget,
        position: item.position,
        translationStatus: item.translationStatus ?? "manual",
      })),
    )
    .returning();
}

/** Delete word_list_items by IDs. */
export async function deleteItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .delete(wordListItems)
    .where(inArray(wordListItems.id, itemIds));
}

/** Update positions for multiple items. */
export async function updateItemPositions(
  updates: { id: string; position: number }[],
): Promise<void> {
  for (const { id, position } of updates) {
    await db
      .update(wordListItems)
      .set({ position, updatedAt: new Date() })
      .where(eq(wordListItems.id, id));
  }
}

/** Archive user_progress entries for given word_list_item IDs (set archived_at). */
export async function archiveProgressForItems(
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .update(userProgress)
    .set({ archivedAt: new Date() })
    .where(inArray(userProgress.wordListItemId, itemIds));
}

/** Batch-update translations on word_list_items. Sets textTarget/textKnown and translationStatus. */
export async function updateItemTranslations(
  updates: {
    id: string;
    textKnown?: string;
    textTarget?: string;
    translationStatus: "manual" | "translated" | "failed";
  }[],
): Promise<void> {
  for (const { id, textKnown, textTarget, translationStatus } of updates) {
    const set: Record<string, unknown> = {
      translationStatus,
      updatedAt: new Date(),
    };
    if (textTarget !== undefined) set.textTarget = textTarget;
    if (textKnown !== undefined) set.textKnown = textKnown;
    await db
      .update(wordListItems)
      .set(set)
      .where(eq(wordListItems.id, id));
  }
}

/**
 * Find existing translations in word_list_items by matching text in the same language pair.
 * Used for DB dedup before calling external translation APIs.
 */
export async function findExistingTranslations(
  texts: string[],
  field: "textKnown" | "textTarget",
  languageFrom: string,
  languageTo: string,
): Promise<{ text: string; translatedText: string }[]> {
  if (texts.length === 0) return [];

  // Search across all word_list_items in lists with matching language pair
  const col = field === "textKnown" ? wordListItems.textKnown : wordListItems.textTarget;
  const otherCol = field === "textKnown" ? wordListItems.textTarget : wordListItems.textKnown;

  const results = await db
    .select({
      text: col,
      translatedText: otherCol,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(
      and(
        inArray(col, texts),
        sql`${otherCol} IS NOT NULL`,
        eq(wordLists.languageFrom, languageFrom),
        eq(wordLists.languageTo, languageTo),
      ),
    );

  // Deduplicate — keep first match per text
  const seen = new Set<string>();
  const deduped: { text: string; translatedText: string }[] = [];
  for (const r of results) {
    if (r.text && r.translatedText && !seen.has(r.text)) {
      seen.add(r.text);
      deduped.push({ text: r.text, translatedText: r.translatedText });
    }
  }
  return deduped;
}

/** Check if a user is subscribed to a list. */
export async function isUserSubscribed(
  userId: string,
  listId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: userListSubscriptions.id })
    .from(userListSubscriptions)
    .where(
      and(
        eq(userListSubscriptions.userId, userId),
        eq(userListSubscriptions.listId, listId),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Subscribe a user to a list. Creates subscription record and copies items
 * into user's own list (copy-on-write).
 * Returns the number of items copied.
 */
export async function subscribeToList(
  userId: string,
  sourceListId: string,
  userListId: string,
): Promise<{ copied: number }> {
  // Create subscription record
  await db.insert(userListSubscriptions).values({
    userId,
    listId: sourceListId,
  });

  // Get source list items and categories
  const sourceItems = await getListItems(sourceListId);
  const sourceCategories = await getListCategories(sourceListId);

  if (sourceItems.length === 0) return { copied: 0 };

  // Map source category IDs to user list categories
  // Create matching categories in user's list if they don't exist
  const catMap = new Map<string, string>();
  for (const srcCat of sourceCategories) {
    const userCat = await createCategory(userListId, srcCat.name, false);
    catMap.set(srcCat.id, userCat.id);
  }

  // Copy items into user's list
  const itemsToCopy = sourceItems.map((item, i) => ({
    listId: userListId,
    categoryId: item.categoryId ? catMap.get(item.categoryId) ?? null : null,
    textKnown: item.textKnown,
    textTarget: item.textTarget,
    position: i,
    translationStatus: item.translationStatus as "manual" | "pending" | "translated" | "failed",
    canonicalWordId: item.id, // Reference back to source item
    audioAssetId: item.audioAssetId, // Shared reference — no duplication
  }));

  // Insert in batches
  const BATCH_SIZE = 100;
  const created: WordListItem[] = [];
  for (let i = 0; i < itemsToCopy.length; i += BATCH_SIZE) {
    const batch = itemsToCopy.slice(i, i + BATCH_SIZE);
    const rows = await db
      .insert(wordListItems)
      .values(batch.map((item) => ({
        listId: item.listId,
        categoryId: item.categoryId,
        canonicalWordId: item.canonicalWordId,
        textKnown: item.textKnown,
        textTarget: item.textTarget,
        position: item.position,
        translationStatus: item.translationStatus,
        audioAssetId: item.audioAssetId,
      })))
      .returning();
    created.push(...rows);
  }

  // Create initial progress entries for copied items
  if (created.length > 0) {
    const progressBatch = created.map((item) => ({
      userId,
      wordListItemId: item.id,
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    }));

    for (let i = 0; i < progressBatch.length; i += BATCH_SIZE) {
      const batch = progressBatch.slice(i, i + BATCH_SIZE);
      await db.insert(userProgress).values(batch);
    }
  }

  return { copied: created.length };
}

/**
 * Unsubscribe a user from a list. Archives progress for items that came
 * from this subscription, deletes copied items, removes subscription record.
 * Returns the number of items archived.
 */
export async function unsubscribeFromList(
  userId: string,
  sourceListId: string,
  userListId: string,
): Promise<{ archived: number }> {
  // Find items in user's list that came from this source (by canonicalWordId matching source items)
  const sourceItems = await getListItems(sourceListId);
  const sourceItemIds = new Set(sourceItems.map((i) => i.id));

  const userItems = await getListItems(userListId);
  const copiedItems = userItems.filter(
    (item) => item.canonicalWordId && sourceItemIds.has(item.canonicalWordId),
  );

  const copiedItemIds = copiedItems.map((i) => i.id);

  if (copiedItemIds.length > 0) {
    // Archive progress
    await archiveProgressForItems(copiedItemIds);
    // Delete copied items
    await deleteItems(copiedItemIds);
  }

  // Remove subscription record
  await db
    .delete(userListSubscriptions)
    .where(
      and(
        eq(userListSubscriptions.userId, userId),
        eq(userListSubscriptions.listId, sourceListId),
      ),
    );

  return { archived: copiedItemIds.length };
}

/** Get or create a user's personal list. Each user has exactly one personal list. */
export async function getOrCreateUserList(
  userId: string,
): Promise<WordList> {
  // Check if user already has a personal list
  const [existing] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.ownerId, userId))
    .limit(1);

  if (existing) return existing;

  // Create a personal list for the user
  return createList({
    ownerId: userId,
    name: "My Words",
    description: null,
    languageFrom: "cs",
    languageTo: "vi",
    isPublic: false,
  });
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
