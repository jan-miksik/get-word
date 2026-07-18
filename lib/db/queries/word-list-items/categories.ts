import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordCategories,
  wordListItems,
  wordLists,
  type WordCategory,
  type WordListItem,
} from '../../schema';

/**
 * Category rows have no updated_at, so category mutations bump the parent
 * list's updated_at instead — that is what the sync content revision watches.
 */
async function touchListForCategoryChange(listId: string): Promise<void> {
  await db
    .update(wordLists)
    .set({ updatedAt: new Date() })
    .where(eq(wordLists.id, listId));
}

export async function getListCategories(listId: string): Promise<WordCategory[]> {
  return db
    .select()
    .from(wordCategories)
    .where(eq(wordCategories.listId, listId))
    .orderBy(asc(wordCategories.position));
}

export async function getCategoriesForLists(
  listIds: string[],
): Promise<WordCategory[]> {
  if (listIds.length === 0) return [];
  return db
    .select()
    .from(wordCategories)
    .where(inArray(wordCategories.listId, listIds))
    .orderBy(asc(wordCategories.position));
}

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

  const [category] = await db
    .insert(wordCategories)
    .values({ listId, name, position, isSystem })
    .returning();
  return category;
}

export async function reorderCategories(
  listId: string,
  orderedIds: string[]
): Promise<void> {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await db
      .update(wordCategories)
      .set({ position: index })
      .where(
        and(
          eq(wordCategories.id, orderedIds[index]),
          eq(wordCategories.listId, listId)
        )
      );
  }
  await touchListForCategoryChange(listId);
}

export async function renameCategory(
  listId: string,
  categoryId: string,
  name: string
): Promise<WordCategory | null> {
  const [updated] = await db
    .update(wordCategories)
    .set({ name })
    .where(
      and(
        eq(wordCategories.id, categoryId),
        eq(wordCategories.listId, listId)
      )
    )
    .returning();
  if (updated) await touchListForCategoryChange(listId);
  return updated ?? null;
}

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

// Move items into a category. Both the category and the items are scoped to
// `listId`, so an item can never be reparented into another list's category and
// a bad/foreign category id simply matches nothing. Only `categoryId` changes —
// text, position, audio, and the content-keyed progress identity are untouched.
// Returns the ids that were actually updated.
export async function assignItemsToCategory(
  listId: string,
  itemIds: string[],
  categoryId: string,
): Promise<string[]> {
  if (itemIds.length === 0) return [];

  const [category] = await db
    .select({ id: wordCategories.id })
    .from(wordCategories)
    .where(and(eq(wordCategories.id, categoryId), eq(wordCategories.listId, listId)));
  if (!category) return [];

  const updated = await db
    .update(wordListItems)
    .set({ categoryId, updatedAt: new Date() })
    .where(
      and(
        eq(wordListItems.listId, listId),
        inArray(wordListItems.id, itemIds),
      ),
    )
    .returning({ id: wordListItems.id });
  return updated.map((row) => row.id);
}

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
