import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordLists,
  wordListItems,
  userListSubscriptions,
  userProgress,
  type WordListItem,
} from '../../schema';
import { createCategory, getListCategories } from './categories';
import {
  archiveProgressForItems,
  deleteItems,
  getListItems,
} from './items';

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

export async function subscribeToList(
  userId: string,
  sourceListId: string,
  userListId: string,
): Promise<{ copied: number }> {
  await db.insert(userListSubscriptions).values({
    userId,
    listId: sourceListId,
  });

  const sourceItems = await getListItems(sourceListId);
  const sourceCategories = await getListCategories(sourceListId);

  if (sourceItems.length === 0) return { copied: 0 };

  const categoryMap = new Map<string, string>();
  for (const sourceCategory of sourceCategories) {
    const userCategory = await createCategory(userListId, sourceCategory.name, false);
    categoryMap.set(sourceCategory.id, userCategory.id);
  }

  const itemsToCopy = sourceItems.map((item, index) => ({
    listId: userListId,
    categoryId: item.categoryId ? categoryMap.get(item.categoryId) ?? null : null,
    textKnown: item.textKnown,
    textTarget: item.textTarget,
    position: index,
    translationStatus: item.translationStatus as 'manual' | 'pending' | 'translated' | 'failed',
    canonicalWordId: item.id,
    knownAudioAssetId: item.knownAudioAssetId,
    audioAssetId: item.audioAssetId,
    // Same language pair (direct copy), so both manual and generated comments
    // carry unchanged.
    comment: item.comment,
  }));

  const batchSize = 100;
  const created: WordListItem[] = [];
  for (let index = 0; index < itemsToCopy.length; index += batchSize) {
    const batch = itemsToCopy.slice(index, index + batchSize);
    const rows = await db
      .insert(wordListItems)
      .values(
        batch.map((item) => ({
          listId: item.listId,
          categoryId: item.categoryId,
          canonicalWordId: item.canonicalWordId,
          textKnown: item.textKnown,
          textTarget: item.textTarget,
          position: item.position,
          translationStatus: item.translationStatus,
          knownAudioAssetId: item.knownAudioAssetId,
          audioAssetId: item.audioAssetId,
          comment: item.comment,
        })),
      )
      .returning();
    created.push(...rows);
  }

  if (created.length > 0) {
    const progressBatch = created.map((item) => ({
      userId,
      wordListItemId: item.id,
      stageIndex: 0,
      knownCount: 0,
      unknownCount: 0,
    }));

    for (let index = 0; index < progressBatch.length; index += batchSize) {
      const batch = progressBatch.slice(index, index + batchSize);
      await db.insert(userProgress).values(batch);
    }
  }

  return { copied: created.length };
}

export async function unsubscribeFromList(
  userId: string,
  sourceListId: string,
): Promise<{ archived: number }> {
  const ownListRows = await db
    .select({ id: wordLists.id })
    .from(wordLists)
    .where(eq(wordLists.ownerId, userId));

  let archivedCount = 0;
  if (ownListRows.length > 0) {
    const ownListIds = ownListRows.map((row) => row.id);
    const sourceItems = await getListItems(sourceListId);
    const sourceItemIds = sourceItems.map((item) => item.id);

    if (sourceItemIds.length > 0) {
      const copiedItems = await db
        .select()
        .from(wordListItems)
        .where(
          and(
            inArray(wordListItems.listId, ownListIds),
            inArray(wordListItems.canonicalWordId, sourceItemIds),
          ),
        );

      const copiedItemIds = copiedItems.map((item) => item.id);
      if (copiedItemIds.length > 0) {
        await archiveProgressForItems(copiedItemIds);
        await deleteItems(copiedItemIds);
        archivedCount = copiedItemIds.length;
      }
    }
  }

  await db
    .delete(userListSubscriptions)
    .where(
      and(
        eq(userListSubscriptions.userId, userId),
        eq(userListSubscriptions.listId, sourceListId),
      ),
    );

  return { archived: archivedCount };
}

export async function createUserSubscription(
  userId: string,
  listId: string,
): Promise<void> {
  await db.insert(userListSubscriptions).values({ userId, listId });
}
