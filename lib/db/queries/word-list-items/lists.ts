import { eq, sql, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordLists,
  userListSubscriptions,
  type WordList,
  type NewWordList,
} from '../../schema';

export async function getUserLists(userId: string): Promise<WordList[]> {
  return db
    .select()
    .from(wordLists)
    .where(sql`${wordLists.ownerId} = ${userId} OR ${wordLists.isPublic} = true`);
}

export async function getUserSubscribedListIds(userId: string): Promise<string[]> {
  const subs = await db
    .select({ listId: userListSubscriptions.listId })
    .from(userListSubscriptions)
    .where(eq(userListSubscriptions.userId, userId));
  return subs.map((subscription) => subscription.listId);
}

export async function getSystemDefaultList(): Promise<WordList | null> {
  const results = await db
    .select()
    .from(wordLists)
    .where(sql`${wordLists.ownerId} IS NULL AND ${wordLists.isPublic} = true`)
    .limit(1);
  return results[0] ?? null;
}

export async function createList(data: NewWordList): Promise<WordList> {
  const [list] = await db.insert(wordLists).values(data).returning();
  return list;
}

export async function updateList(
  listId: string,
  data: Partial<Pick<WordList, 'name' | 'description' | 'isPublic'>>
): Promise<WordList | null> {
  const [updated] = await db
    .update(wordLists)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(wordLists.id, listId))
    .returning();
  return updated ?? null;
}

export async function deleteList(listId: string): Promise<boolean> {
  const result = await db
    .delete(wordLists)
    .where(eq(wordLists.id, listId))
    .returning({ id: wordLists.id });
  return result.length > 0;
}

export async function getListById(listId: string): Promise<WordList | null> {
  const [list] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.id, listId))
    .limit(1);
  return list ?? null;
}

export async function getWordListsByIds(
  ids: string[],
): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: wordLists.id, name: wordLists.name })
    .from(wordLists)
    .where(inArray(wordLists.id, ids));
}

export async function getOrCreateUserList(userId: string): Promise<WordList> {
  const [existing] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.ownerId, userId))
    .limit(1);

  if (existing) return existing;

  return createList({
    ownerId: userId,
    name: 'My Words',
    description: null,
    languageFrom: 'cs',
    languageTo: 'vi',
    isPublic: false,
  });
}
