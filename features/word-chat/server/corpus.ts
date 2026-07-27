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
 * Edge punctuation and symbols, stripped from both ends before comparing.
 *
 * `normalizeText` already drops trailing dots, but a model writes "Kolik to
 * stojí?" where the list has "Kolik to stojí", and quotes, dashes and Spanish
 * opening marks all produce the same near-miss.
 */
const EDGE_PUNCTUATION = /^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu;

/**
 * Comparison key for "is this the same item".
 *
 * Deliberately looser than the progress content key: case-folded, whitespace
 * collapsed, and stripped of surrounding punctuation, so a learner who studies
 * "dobrý den" is not offered "Dobrý den!" and a generated line still matches an
 * existing item it only differs from cosmetically.
 *
 * It stops there on purpose. Diacritics are NOT folded (`byt` and `být` are
 * different words), and neither are articles or inflection — a looser key would
 * silently substitute the wrong item, which is a quality bug that never shows up
 * in the data. This key must never be used for progress identity; see
 * `buildContentKeyInput` in `lib/progress-key.ts`, which stays strict.
 */
export function dedupKey(text: string): string {
  return normalizeText(text, { ignoreCase: true }).replace(EDGE_PUNCTUATION, "");
}

export type CorpusEntry = {
  id: string;
  text: string;
  categoryName: string | null;
  /**
   * True when the source list is curated (recommended/common), i.e. its
   * translation has been through review. False entries are reused too — see
   * `loadCorpusPool` — but the distinction is recorded so they can be found
   * again once translations carry verification tiers.
   */
  verified: boolean;
};

/**
 * Existing translated items this language pair can reuse, keyed by text.
 *
 * This pool is no longer sent to the model — the proposal call generates freely
 * and the server matches its output against these rows afterwards. So the pool
 * exists purely to be searched, and being wide costs prompt tokens nowhere.
 *
 * It deliberately includes UNVERIFIED public lists alongside curated ones. A
 * fresh translation of "kolik to stojí" would land on much the same answer, and
 * a hit brings the already-generated audio asset with it. The two tiers are
 * distinguished by `verified` rather than filtered, so the reuse rate and its
 * quality can be judged from real data instead of guessed at.
 *
 * Curated rows are ordered first so they win the dedup race when both tiers
 * hold the same text.
 */
export async function loadCorpusPool(input: {
  languageFrom: string;
  languageTo: string;
  limit?: number;
}): Promise<CorpusEntry[]> {
  const fromVariants = getListLanguageCodeVariants(input.languageFrom);
  const toVariants = getListLanguageCodeVariants(input.languageTo);
  const verified = sql<boolean>`(${wordLists.isRecommended} or ${wordLists.isCommon})`;

  const rows = await db
    .select({
      id: wordListItems.id,
      text: wordListItems.textKnown,
      categoryName: wordCategories.name,
      verified,
    })
    .from(wordListItems)
    .innerJoin(wordLists, eq(wordListItems.listId, wordLists.id))
    .leftJoin(wordCategories, eq(wordListItems.categoryId, wordCategories.id))
    .where(
      and(
        inArray(wordLists.languageFrom, fromVariants),
        inArray(wordLists.languageTo, toVariants),
        // Personal lists are excluded whatever their visibility: one learner's
        // saved session is not reference material for the next learner.
        eq(wordLists.isPersonal, false),
        or(
          eq(wordLists.isRecommended, true),
          eq(wordLists.isCommon, true),
          eq(wordLists.isPublic, true),
        ),
        sql`${wordListItems.textTarget} is not null and ${wordListItems.textTarget} <> ''`,
      ),
    )
    .orderBy(desc(verified), desc(wordLists.isRecommended), wordListItems.position)
    .limit(input.limit ?? CORPUS_POOL_LIMIT);

  const seen = new Set<string>();
  const pool: CorpusEntry[] = [];
  for (const row of rows) {
    const key = dedupKey(row.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    pool.push({
      id: row.id,
      text: row.text,
      categoryName: row.categoryName,
      verified: Boolean(row.verified),
    });
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
