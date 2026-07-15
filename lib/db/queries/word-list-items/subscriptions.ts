import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../../client';
import type { Executor } from '../executor';
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
import { generateShareToken, setListShareToken } from './lists';

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
    acceptedKnown: item.acceptedKnown,
    acceptedTarget: item.acceptedTarget,
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
          acceptedKnown: item.acceptedKnown,
          acceptedTarget: item.acceptedTarget,
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

/**
 * Delete every subscription to a list. Used by the share-link reset to cut off
 * existing students on a private list.
 */
export async function deleteListSubscriptions(
  listId: string,
  executor: Executor = db,
): Promise<number> {
  const deleted = await executor
    .delete(userListSubscriptions)
    .where(eq(userListSubscriptions.listId, listId))
    .returning({ id: userListSubscriptions.id });
  return deleted.length;
}

/**
 * Atomically rotate a list's share token and, for private lists, drop all
 * subscriptions (cutting off existing students). Public lists keep their
 * subscribers — the list is still openly available, so only the old URL is
 * invalidated. Assumes the caller already authorized ownership. Returns the new
 * token, or null if the list does not exist.
 */
export async function resetListShareTokenAndDeleteSubscriptions(
  listId: string,
): Promise<{ token: string; revokedSubscribers: number } | null> {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select({ id: wordLists.id, isPublic: wordLists.isPublic })
      .from(wordLists)
      .where(eq(wordLists.id, listId))
      .limit(1);
    if (!list) return null;

    const token = generateShareToken();
    await setListShareToken(listId, token, tx);

    let revokedSubscribers = 0;
    if (!list.isPublic) {
      revokedSubscribers = await deleteListSubscriptions(listId, tx);
    }
    return { token, revokedSubscribers };
  });
}

/**
 * Count distinct subscribers per list. Owners can't subscribe to their own list
 * (the subscribe route 400s that), but `excludeUserId` lets the account-deletion
 * path exclude the owner explicitly as insurance against future changes.
 * Returns a Map keyed by listId; lists with zero subscribers are absent.
 */
export async function getSubscriberCountsForLists(
  listIds: string[],
  executor: Executor = db,
  opts?: { excludeUserId?: string },
): Promise<Map<string, number>> {
  if (listIds.length === 0) return new Map();
  const conditions = [inArray(userListSubscriptions.listId, listIds)];
  if (opts?.excludeUserId) {
    conditions.push(ne(userListSubscriptions.userId, opts.excludeUserId));
  }
  const rows = await executor
    .select({
      listId: userListSubscriptions.listId,
      count: sql<number>`count(distinct ${userListSubscriptions.userId})`,
    })
    .from(userListSubscriptions)
    .where(and(...conditions))
    .groupBy(userListSubscriptions.listId);
  return new Map(rows.map((row) => [row.listId, Number(row.count)]));
}

export type OwnedListSubscriberInfo = {
  listId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isRecommended: boolean;
  isCommon: boolean;
  subscriberCount: number;
};

/**
 * Lists owned by `ownerId` with their (owner-excluded) subscriber counts. Used
 * by the account-deletion preview (no lock) and the deletion saga (`lock: true`
 * issues `SELECT … FOR UPDATE` on the owned list rows inside the transaction so
 * the keep/delete partition is computed against a stable snapshot).
 */
export async function getOwnedListsWithSubscriberCounts(
  ownerId: string,
  executor: Executor = db,
  opts?: { lock?: boolean },
): Promise<OwnedListSubscriberInfo[]> {
  const baseQuery = executor
    .select({
      id: wordLists.id,
      name: wordLists.name,
      description: wordLists.description,
      isPublic: wordLists.isPublic,
      isRecommended: wordLists.isRecommended,
      isCommon: wordLists.isCommon,
    })
    .from(wordLists)
    .where(eq(wordLists.ownerId, ownerId));

  const owned = await (opts?.lock ? baseQuery.for('update') : baseQuery);
  if (owned.length === 0) return [];

  const counts = await getSubscriberCountsForLists(
    owned.map((list) => list.id),
    executor,
    { excludeUserId: ownerId },
  );

  return owned.map((list) => ({
    listId: list.id,
    name: list.name,
    description: list.description,
    isPublic: list.isPublic,
    isRecommended: list.isRecommended,
    isCommon: list.isCommon,
    subscriberCount: counts.get(list.id) ?? 0,
  }));
}
