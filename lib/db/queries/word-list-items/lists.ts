import { and, eq, or, sql, inArray, desc } from 'drizzle-orm';
import { db } from '../../client';
import {
  wordLists,
  wordListItems,
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
        or(eq(wordLists.ownerId, userId), eq(wordLists.isPublic, true)),
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

export type RecommendedWordListReason = 'exact' | 'reverse' | 'fallback_seed';

export type RecommendedWordListResult = {
  list: WordList;
  reason: RecommendedWordListReason;
};

export function pickRecommendedWordList(
  lists: WordList[],
  languageFrom: string,
  languageTo: string,
  fallbackSeed: WordList | null = null,
): RecommendedWordListResult | null {
  const exact = lists.find((list) =>
    list.isRecommended && isExactLanguagePair(list, languageFrom, languageTo)
  );
  if (exact) return { list: exact, reason: 'exact' };

  const reverse = lists.find((list) =>
    list.isRecommended && isReverseLanguagePair(list, languageFrom, languageTo)
  );
  if (reverse) return { list: reverse, reason: 'reverse' };

  if (fallbackSeed) return { list: fallbackSeed, reason: 'fallback_seed' };
  return null;
}

export async function getRecommendedWordListForLanguagePair(
  userId: string,
  languageFrom: string,
  languageTo: string,
): Promise<RecommendedWordListResult | null> {
  const [matchingLists, fallbackSeed] = await Promise.all([
    getUserListsByLanguagePair(userId, languageFrom, languageTo),
    getSystemDefaultList(),
  ]);
  return pickRecommendedWordList(matchingLists, languageFrom, languageTo, fallbackSeed);
}

export async function getUserSubscribedListIds(userId: string): Promise<string[]> {
  const subs = await db
    .select({ listId: userListSubscriptions.listId })
    .from(userListSubscriptions)
    .where(eq(userListSubscriptions.userId, userId));
  return subs.map((subscription) => subscription.listId);
}

export async function getSystemDefaultList(): Promise<WordList | null> {
  const commonResults = await db
    .select()
    .from(wordLists)
    .where(and(eq(wordLists.isCommon, true), eq(wordLists.isPublic, true)))
    .orderBy(desc(wordLists.updatedAt))
    .limit(1);
  if (commonResults[0]) return commonResults[0];

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
  data: Partial<Pick<WordList, 'name' | 'description' | 'isPublic' | 'isCommon' | 'isRecommended' | 'languageFrom' | 'languageTo'>>
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
    const shouldRemainRecommended = data.isRecommended ?? current.isRecommended;
    const updateData = {
      ...data,
      ...(data.isCommon === true || shouldRemainRecommended ? { isPublic: true } : {}),
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
        itemUpdate.knownAudioAssetId = null;
        itemUpdate.knownAudioStatus = 'none';
      }
      if (languageToChanged) {
        itemUpdate.textTarget = null;
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
): Promise<{
  id: string;
  name: string;
  languageFrom: string;
  languageTo: string;
  isRecommended: boolean;
}[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: wordLists.id,
      name: wordLists.name,
      languageFrom: wordLists.languageFrom,
      languageTo: wordLists.languageTo,
      isRecommended: wordLists.isRecommended,
    })
    .from(wordLists)
    .where(inArray(wordLists.id, ids));
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

export async function getOrCreateUserList(
  userId: string,
  languageFrom = 'cs',
  languageTo = 'vi',
): Promise<WordList> {
  const [existing] = await db
    .select()
    .from(wordLists)
    .where(
      and(
        eq(wordLists.ownerId, userId),
        eq(wordLists.languageFrom, languageFrom),
        eq(wordLists.languageTo, languageTo),
      ),
    )
    .limit(1);

  if (existing) return existing;

  return createList({
    ownerId: userId,
    name: 'My Words',
    description: null,
    languageFrom,
    languageTo,
    isPublic: false,
  });
}
