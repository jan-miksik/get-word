import crypto from 'node:crypto';
import { and, eq, or, sql, inArray, isNull, notExists } from 'drizzle-orm';
import { db } from '../../client';
import type { Executor } from '../executor';
import {
  wordLists,
  wordListItems,
  userListSubscriptions,
  userBlocks,
  type WordList,
  type NewWordList,
} from '../../schema';

function noBlockBetweenListOwnerAndUser(userId: string) {
  return or(
    isNull(wordLists.ownerId),
    eq(wordLists.ownerId, userId),
    notExists(
      db
        .select({ id: userBlocks.id })
        .from(userBlocks)
        .where(
          or(
            and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, wordLists.ownerId)),
            and(eq(userBlocks.blockerId, wordLists.ownerId), eq(userBlocks.blockedId, userId)),
          ),
        ),
    ),
  );
}

export async function getUserLists(userId: string): Promise<WordList[]> {
  // owned ∪ public ∪ subscribed (including private lists joined via a share
  // link). The subscribed clause is what lets a shared private list render in
  // the sidebar — it has no row in the owned/public sets.
  //
  // Personal word-chat lists are excluded from the PUBLIC clause only: their
  // owner still sees them (owned clause) and anyone who deliberately subscribed
  // still sees them (subscribed clause), but a public personal list must never
  // land in every other user's sidebar just for being public.
  return db
    .select()
    .from(wordLists)
    .where(
      or(
        eq(wordLists.ownerId, userId),
        and(
          eq(wordLists.moderationStatus, 'visible'),
          noBlockBetweenListOwnerAndUser(userId),
          or(
            and(eq(wordLists.isPublic, true), eq(wordLists.isPersonal, false)),
            inArray(
              wordLists.id,
              db
                .select({ id: userListSubscriptions.listId })
                .from(userListSubscriptions)
                .where(eq(userListSubscriptions.userId, userId)),
            ),
          ),
        ),
      ),
    );
}

export async function getUserListsByLanguagePair(
  userId: string,
  languageFrom: string,
  languageTo: string,
): Promise<WordList[]> {
  const fromVariants = getListLanguageCodeVariants(languageFrom);
  const toVariants = getListLanguageCodeVariants(languageTo);

  return db
    .select()
    .from(wordLists)
    .where(
      and(
        or(
          and(
            inArray(wordLists.languageFrom, fromVariants),
            inArray(wordLists.languageTo, toVariants),
          ),
          and(
            inArray(wordLists.languageFrom, toVariants),
            inArray(wordLists.languageTo, fromVariants),
          ),
        ),
        // Same rule as getUserLists: someone else's personal list is not a
        // "matching list for this language pair", even when it is public.
        or(
          eq(wordLists.ownerId, userId),
          and(
            eq(wordLists.isPublic, true),
            eq(wordLists.isPersonal, false),
            eq(wordLists.moderationStatus, 'visible'),
            noBlockBetweenListOwnerAndUser(userId),
          ),
        ),
      ),
    );
}

export function normalizeListLanguageCode(code: string): string {
  const trimmed = String(code).trim();
  if (!trimmed) return '';
  const [base, region] = trimmed.split('-');
  const normalizedBase = base.toLowerCase();
  if (normalizedBase === 'cs' || normalizedBase === 'cz') return 'cs';
  return region ? `${normalizedBase}-${region.toUpperCase()}` : normalizedBase;
}

export function getListLanguageCodeVariants(code: string): string[] {
  const normalized = normalizeListLanguageCode(code);
  return normalized === 'cs' ? ['cs', 'cz'] : [normalized];
}

function isSameLanguageCode(left: string, right: string): boolean {
  return normalizeListLanguageCode(left) === normalizeListLanguageCode(right);
}

function isExactLanguagePair(
  list: Pick<WordList, 'languageFrom' | 'languageTo'>,
  languageFrom: string,
  languageTo: string,
): boolean {
  return (
    isSameLanguageCode(list.languageFrom, languageFrom) &&
    isSameLanguageCode(list.languageTo, languageTo)
  );
}

function isReverseLanguagePair(
  list: Pick<WordList, 'languageFrom' | 'languageTo'>,
  languageFrom: string,
  languageTo: string,
): boolean {
  return (
    isSameLanguageCode(list.languageFrom, languageTo) &&
    isSameLanguageCode(list.languageTo, languageFrom)
  );
}

type RecommendedWordListReason = 'exact' | 'reverse' | 'fallback_seed';

export type RecommendedWordListResult = {
  list: WordList;
  reason: RecommendedWordListReason;
};

export function pickRecommendedWordList(
  lists: WordList[],
  languageFrom: string,
  languageTo: string,
  fallbackSeed: WordList | null = null,
  userId: string | null = null,
): RecommendedWordListResult | null {
  const exactRecommended = lists.find((list) =>
    list.isRecommended && isExactLanguagePair(list, languageFrom, languageTo)
  );
  if (exactRecommended) return { list: exactRecommended, reason: 'exact' };

  // A list the user already owns in the exact requested direction (for example,
  // a private customize-fork) beats a reverse-direction match: it studies the
  // right way round. Shared reversed lists are deduped earlier as public
  // recommended exact-direction lists.
  const exactOwned = userId
    ? lists.find((list) =>
        list.ownerId === userId && isExactLanguagePair(list, languageFrom, languageTo)
      )
    : undefined;
  if (exactOwned) return { list: exactOwned, reason: 'exact' };

  const reverse = lists.find((list) =>
    list.isRecommended && isReverseLanguagePair(list, languageFrom, languageTo)
  );
  if (reverse) return { list: reverse, reason: 'reverse' };

  if (fallbackSeed) return { list: fallbackSeed, reason: 'fallback_seed' };
  return null;
}

export async function getUserSubscribedListIds(userId: string): Promise<string[]> {
  const subs = await db
    .select({ listId: userListSubscriptions.listId })
    .from(userListSubscriptions)
    .where(eq(userListSubscriptions.userId, userId));
  return subs.map((subscription) => subscription.listId);
}

export async function createList(data: NewWordList): Promise<WordList> {
  const [list] = await db.insert(wordLists).values(data).returning();
  return list;
}

export async function updateList(
  listId: string,
  data: Partial<Pick<WordList, 'name' | 'description' | 'isPublic' | 'isCommon' | 'isRecommended' | 'isAutogenerated' | 'ownerId' | 'languageFrom' | 'languageTo'>>
): Promise<WordList | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(wordLists)
      .where(eq(wordLists.id, listId))
      .limit(1);
    if (!current) return null;

    if (data.isCommon === true) {
      await tx
        .update(wordLists)
        .set({ isCommon: false, updatedAt: new Date() })
        .where(eq(wordLists.isCommon, true));
    }

    if (data.isRecommended === true) {
      const recommendationLanguageFrom = data.languageFrom ?? current.languageFrom;
      const recommendationLanguageTo = data.languageTo ?? current.languageTo;
      await tx
        .update(wordLists)
        .set({ isRecommended: false, updatedAt: new Date() })
        .where(
          and(
            eq(wordLists.isRecommended, true),
            inArray(wordLists.languageFrom, getListLanguageCodeVariants(recommendationLanguageFrom)),
            inArray(wordLists.languageTo, getListLanguageCodeVariants(recommendationLanguageTo)),
          ),
        );
    }

    const languageFromChanged =
      data.languageFrom !== undefined &&
      normalizeListLanguageCode(data.languageFrom) !== normalizeListLanguageCode(current.languageFrom);
    const languageToChanged =
      data.languageTo !== undefined &&
      normalizeListLanguageCode(data.languageTo) !== normalizeListLanguageCode(current.languageTo);
    // Common/recommended lists are always public — coerce isPublic true even
    // when a plain visibility toggle tries to flip an existing common list to
    // private without re-sending the isCommon flag.
    const shouldRemainRecommended = data.isRecommended ?? current.isRecommended;
    const shouldRemainCommon = data.isCommon ?? current.isCommon;
    const nextIsPublic =
      shouldRemainCommon || shouldRemainRecommended
        ? true
        : data.isPublic ?? current.isPublic;
    // Going public → private rotates the share token. While a list is public
    // anyone can copy its /join token; that token would otherwise survive the
    // switch and keep granting access to the now-private list. Rotating kills
    // every leaked link. Existing subscribers keep access (their rows are
    // untouched) — dropping them is the separate, heavier "reset link" action.
    const goingPrivate = current.isPublic && !nextIsPublic;
    const updateData = {
      ...data,
      isPublic: nextIsPublic,
      ...(goingPrivate ? { shareToken: generateShareToken() } : {}),
      updatedAt: new Date(),
    };

    const [updated] = await tx
      .update(wordLists)
      .set(updateData)
      .where(eq(wordLists.id, listId))
      .returning();

    if (languageFromChanged || languageToChanged) {
      const itemUpdate: Record<string, unknown> = {
        translationStatus: 'pending',
        updatedAt: new Date(),
      };
      if (languageFromChanged) {
        itemUpdate.textKnown = '';
        itemUpdate.acceptedKnown = [];
        itemUpdate.knownAudioAssetId = null;
        itemUpdate.knownAudioStatus = 'none';
      }
      if (languageToChanged) {
        itemUpdate.textTarget = null;
        itemUpdate.acceptedTarget = [];
        itemUpdate.audioAssetId = null;
        itemUpdate.audioStatus = 'none';
      }

      await tx
        .update(wordListItems)
        .set(itemUpdate)
        .where(eq(wordListItems.listId, listId));
    }

    return updated ?? null;
  });
}

export async function deleteList(
  listId: string,
  executor: Executor = db,
): Promise<boolean> {
  const result = await executor
    .delete(wordLists)
    .where(eq(wordLists.id, listId))
    .returning({ id: wordLists.id });
  return result.length > 0;
}

/**
 * Anonymize a list during account deletion: sever ownership (owner_id = NULL,
 * i.e. handed to the Get Word system pool) and scrub the free-text description
 * that may identify the former owner. Unlike `updateList`, this is a single flat
 * UPDATE with no side effects, so it can safely run inside the deletion
 * transaction. The list name is intentionally left untouched — it is the list's
 * identity for subscribers; the delete UI warns owners to rename first.
 */
export async function setListOwnerNullAndScrub(
  listId: string,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(wordLists)
    .set({ ownerId: null, description: null, updatedAt: new Date() })
    .where(eq(wordLists.id, listId));
}

export async function getListById(listId: string): Promise<WordList | null> {
  const [list] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.id, listId))
    .limit(1);
  return list ?? null;
}

/** URL-safe, non-enumerable share token (24 bytes base64url ≈ 32 chars). */
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function getListByShareToken(token: string): Promise<WordList | null> {
  const [list] = await db
    .select()
    .from(wordLists)
    .where(eq(wordLists.shareToken, token))
    .limit(1);
  return list ?? null;
}

export async function setListShareToken(
  listId: string,
  token: string | null,
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(wordLists)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(wordLists.id, listId));
}

/**
 * Return the list's existing share token, generating and persisting one if
 * absent. Runs in a transaction with a `FOR UPDATE` row read so concurrent
 * "copy link" clicks converge on a single token. Assumes the caller already
 * authorized ownership. Returns null if the list does not exist.
 */
export async function getOrCreateListShareToken(
  listId: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [list] = await tx
      .select({ shareToken: wordLists.shareToken })
      .from(wordLists)
      .where(eq(wordLists.id, listId))
      .limit(1)
      .for('update');
    if (!list) return null;
    if (list.shareToken) return list.shareToken;

    const token = generateShareToken();
    await setListShareToken(listId, token, tx);
    return token;
  });
}

export async function getUserStudyLists(
  userId: string,
): Promise<{
  id: string;
  name: string;
  languageFrom: string;
  languageTo: string;
  isRecommended: boolean;
  isPersonal: boolean;
  isOwnedPersonal: boolean;
}[]> {
  return db
    .select({
      id: wordLists.id,
      name: wordLists.name,
      languageFrom: wordLists.languageFrom,
      languageTo: wordLists.languageTo,
      isRecommended: wordLists.isRecommended,
      isPersonal: wordLists.isPersonal,
      isOwnedPersonal: sql<boolean>`(
        ${wordLists.isPersonal} = true and ${wordLists.ownerId} = ${userId}
      )`,
    })
    .from(wordLists)
    .where(
      or(
        eq(wordLists.ownerId, userId),
        and(
          eq(wordLists.moderationStatus, 'visible'),
          noBlockBetweenListOwnerAndUser(userId),
          inArray(
            wordLists.id,
            db
              .select({ id: userListSubscriptions.listId })
              .from(userListSubscriptions)
              .where(eq(userListSubscriptions.userId, userId)),
          ),
        ),
      ),
    );
}

export async function getWordListItemCountsByListIds(
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      listId: wordListItems.listId,
      itemCount: sql<number>`count(*)::int`,
    })
    .from(wordListItems)
    .where(inArray(wordListItems.listId, ids))
    .groupBy(wordListItems.listId);

  return new Map(rows.map((row) => [row.listId, row.itemCount]));
}
