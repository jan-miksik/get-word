import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordLists,
  wordListItems,
  userProgress,
  type WordListItem,
} from '../../schema';
import { getUserSubscribedListIds } from './lists';

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
