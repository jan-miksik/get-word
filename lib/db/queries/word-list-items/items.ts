import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordLists,
  wordListItems,
  userProgress,
  type WordListItem,
} from '../../schema';
import { getUserSubscribedListIds } from './lists';
import {
  normalizeWordItemComment,
  pickWinningComment,
  type WordItemComment,
} from '@/lib/word-item-comment';

export async function getListItems(listId: string): Promise<WordListItem[]> {
  return db
    .select()
    .from(wordListItems)
    .where(eq(wordListItems.listId, listId))
    .orderBy(asc(wordListItems.position));
}

export async function getUserSubscribedItems(userId: string): Promise<WordListItem[]> {
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

/**
 * Lean item identities (id + text + languages + ignoreCase) for every item in
 * the user's subscribed or owned lists. Used by the delta sync path to project
 * content-keyed progress without hydrating media/categories.
 */
export async function getUserItemIdentities(userId: string): Promise<
  Array<{
    id: string;
    textKnown: string;
    textTarget: string | null;
    ignoreCase: boolean;
    languageFrom: string;
    languageTo: string;
  }>
> {
  const subscribedListIds = await getUserSubscribedListIds(userId);
  const ownedRows = await db
    .select({ id: wordLists.id })
    .from(wordLists)
    .where(eq(wordLists.ownerId, userId));
  const listIds = [
    ...new Set([...subscribedListIds, ...ownedRows.map((row) => row.id)]),
  ];
  if (listIds.length === 0) return [];

  return db
    .select({
      id: wordListItems.id,
      textKnown: wordListItems.textKnown,
      textTarget: wordListItems.textTarget,
      ignoreCase: wordListItems.ignoreCase,
      languageFrom: wordLists.languageFrom,
      languageTo: wordLists.languageTo,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(inArray(wordListItems.listId, listIds));
}

export async function createItems(
  items: {
    listId: string;
    categoryId: string;
    textKnown: string;
    textTarget: string | null;
    position: number;
    translationStatus?: 'manual' | 'pending' | 'translated' | 'failed';
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
        translationStatus: item.translationStatus ?? 'manual',
      })),
    )
    .returning();
}

export async function deleteItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .delete(wordListItems)
    .where(inArray(wordListItems.id, itemIds));
}

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

export async function archiveProgressForItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db
    .update(userProgress)
    .set({ archivedAt: new Date() })
    .where(inArray(userProgress.wordListItemId, itemIds));
}

/**
 * Set (or clear) the manual study-note comment on a single item. The value is
 * normalized before writing; passing null clears it. Manual edits always win
 * over a prior generated comment, so this overwrites unconditionally.
 */
export async function setItemComment(
  itemId: string,
  comment: WordItemComment | null,
): Promise<void> {
  await db
    .update(wordListItems)
    .set({ comment: comment ? normalizeWordItemComment(comment) : null, updatedAt: new Date() })
    .where(eq(wordListItems.id, itemId));
}

/**
 * Idempotently attach generated comments to a list's items. Only fills items
 * whose comment is empty or already `generated`; rows with a `manual` comment
 * are skipped so a manual note is never clobbered. Safe to retry / resume.
 * Returns the number of rows written.
 */
export async function applyGeneratedComments(
  listId: string,
  byItemId: Map<string, WordItemComment>,
): Promise<number> {
  if (byItemId.size === 0) return 0;
  const itemIds = [...byItemId.keys()];
  // Fetch only fillable rows: comment is null OR its source is 'generated'.
  const rows = await db
    .select({ id: wordListItems.id, comment: wordListItems.comment })
    .from(wordListItems)
    .where(
      and(
        eq(wordListItems.listId, listId),
        inArray(wordListItems.id, itemIds),
        or(
          isNull(wordListItems.comment),
          sql`${wordListItems.comment}->>'source' = 'generated'`,
        ),
      ),
    );

  let written = 0;
  for (const row of rows) {
    const incoming = byItemId.get(row.id);
    if (!incoming) continue;
    const existing = normalizeWordItemComment(row.comment);
    // existing here is null or generated (manual filtered out by the query),
    // so the incoming generated comment always wins.
    const next = pickWinningComment(existing, incoming);
    if (!next || next === existing) continue;
    await db
      .update(wordListItems)
      .set({ comment: next, updatedAt: new Date() })
      .where(eq(wordListItems.id, row.id));
    written += 1;
  }
  return written;
}

export async function getUserOwnListItems(userId: string): Promise<WordListItem[]> {
  const ownListRows = await db
    .select({ id: wordLists.id })
    .from(wordLists)
    .where(eq(wordLists.ownerId, userId));

  if (ownListRows.length === 0) return [];
  const ownListIds = ownListRows.map((row) => row.id);

  return db
    .select()
    .from(wordListItems)
    .where(
      and(
        inArray(wordListItems.listId, ownListIds),
        sql`${wordListItems.textKnown} IS NOT NULL AND ${wordListItems.textTarget} IS NOT NULL`,
      ),
    )
    .orderBy(asc(wordListItems.position));
}
