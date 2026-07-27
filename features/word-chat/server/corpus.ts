import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  mediaAssets,
  userListSubscriptions,
  wordCategories,
  wordListItems,
  wordLists,
} from "@/lib/db/schema";
import { getListLanguageCodeVariants } from "@/lib/db/queries/word-list-items/lists";
import { normalizeText } from "@/lib/progress-key";
import { CORPUS_POOL_LIMIT, EXCLUSION_LIMIT } from "./config";

/**
 * Comparison key for "is this the same item". Case-folded on purpose: a learner
 * who already studies "dobrý den" must not be offered "Dobrý den" next session.
 */
export function dedupKey(text: string): string {
  return normalizeText(text, { ignoreCase: true });
}

export type CorpusEntry = {
  id: string;
  text: string;
  categoryName: string | null;
};

/**
 * Source texts the proposal call may reuse verbatim by id.
 *
 * Only VERIFIED content belongs here — curated and recommended lists — never
 * "every public list". A reused entry brings its reviewed translation and its
 * already-generated audio asset across for free, so pool quality decides both
 * the quality and the cost of everything downstream.
 */
export async function loadCorpusPool(input: {
  languageFrom: string;
  languageTo: string;
  limit?: number;
}): Promise<CorpusEntry[]> {
  const fromVariants = getListLanguageCodeVariants(input.languageFrom);
  const toVariants = getListLanguageCodeVariants(input.languageTo);

  const rows = await db
    .select({
      id: wordListItems.id,
      text: wordListItems.textKnown,
      categoryName: wordCategories.name,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .leftJoin(wordCategories, eq(wordListItems.categoryId, wordCategories.id))
    .where(
      and(
        inArray(wordLists.languageFrom, fromVariants),
        inArray(wordLists.languageTo, toVariants),
        eq(wordLists.isPersonal, false),
        or(eq(wordLists.isRecommended, true), eq(wordLists.isCommon, true)),
        sql`${wordListItems.textTarget} is not null and ${wordListItems.textTarget} <> ''`,
      ),
    )
    .orderBy(desc(wordLists.isRecommended), wordListItems.position)
    .limit(input.limit ?? CORPUS_POOL_LIMIT);

  const seen = new Set<string>();
  const pool: CorpusEntry[] = [];
  for (const row of rows) {
    const key = dedupKey(row.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pool.push({ id: row.id, text: row.text, categoryName: row.categoryName });
  }
  return pool;
}

/**
 * Every known-language text the learner already studies, in this direction —
 * from lists they own and lists they subscribe to. Sent to the model as "never
 * propose these", and re-checked server-side afterwards because the model's
 * compliance is a quality hint, not a guarantee.
 */
export async function loadExclusions(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
  limit?: number;
}): Promise<string[]> {
  const fromVariants = getListLanguageCodeVariants(input.languageFrom);
  const toVariants = getListLanguageCodeVariants(input.languageTo);

  const rows = await db
    .select({ text: wordListItems.textKnown })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .where(
      and(
        inArray(wordLists.languageFrom, fromVariants),
        inArray(wordLists.languageTo, toVariants),
        or(
          eq(wordLists.ownerId, input.userId),
          inArray(
            wordLists.id,
            db
              .select({ id: userListSubscriptions.listId })
              .from(userListSubscriptions)
              .where(eq(userListSubscriptions.userId, input.userId)),
          ),
        ),
      ),
    )
    .orderBy(desc(wordListItems.createdAt))
    .limit(input.limit ?? EXCLUSION_LIMIT);

  const seen = new Set<string>();
  const texts: string[] = [];
  for (const row of rows) {
    const key = dedupKey(row.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    texts.push(row.text);
  }
  return texts;
}

/**
 * Resolve corpus ids the model referenced back to real, still-existing rows.
 *
 * The audio content hash comes along because Review plays clips through
 * `/api/audio/[hash]`: an asset id alone is enough to save the item later, but
 * not enough to hear it now.
 */
export async function loadCorpusItems(ids: string[]) {
  if (ids.length === 0) return new Map<string, {
    id: string;
    textKnown: string;
    textTarget: string | null;
    audioAssetId: string | null;
    audioHash: string | null;
    knownAudioAssetId: string | null;
  }>();

  const rows = await db
    .select({
      id: wordListItems.id,
      textKnown: wordListItems.textKnown,
      textTarget: wordListItems.textTarget,
      audioAssetId: wordListItems.audioAssetId,
      audioHash: mediaAssets.contentHash,
      knownAudioAssetId: wordListItems.knownAudioAssetId,
    })
    .from(wordListItems)
    .leftJoin(mediaAssets, eq(wordListItems.audioAssetId, mediaAssets.id))
    .where(inArray(wordListItems.id, ids));

  return new Map(rows.map((row) => [row.id, row]));
}
