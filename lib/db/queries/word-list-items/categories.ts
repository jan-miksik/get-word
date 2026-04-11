import { and, asc, eq, max } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordCategories,
  wordListItems,
  type WordCategory,
  type WordListItem,
} from '../../schema';

export async function getListCategories(listId: string): Promise<WordCategory[]> {
  return db
    .select()
    .from(wordCategories)
    .where(eq(wordCategories.listId, listId))
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
