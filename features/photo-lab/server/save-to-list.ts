import { and, eq, sql } from "drizzle-orm";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import { findMediaByHashes } from "@/lib/db";
import { db } from "@/lib/db/client";
import type { Executor } from "@/lib/db/queries/executor";
import { wordCategories, wordListItems, wordLists, type WordList } from "@/lib/db/schema";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { computeContentKey } from "@/lib/progress-key";
// The learner's personal "My words" list is not a word-chat concept — it is the
// one place per direction where words the learner made themselves land. Photo
// Lab saves into the same row rather than opening a parallel list.
import { personalListName } from "@/features/word-chat/personal-list-name";
import { getPersonalList } from "@/features/word-chat/server/personal-list";
import { MAX_LABELS } from "./config";

/** One label the learner ticked in the save dialog. */
export type PhotoLabSaveItem = {
  known: string;
  target: string;
  /** Content hash of the already-generated label clip, when there is one. */
  audioHash?: string | null;
};

/** Per-word verdict, so the UI can say which pair was already there. */
type PhotoLabSaveItemResult = {
  known: string;
  target: string;
  outcome: "added" | "duplicate";
};

export type PhotoLabSaveResult = {
  listId: string;
  listName: string;
  /** Null when everything was already in the list, so no category was needed. */
  categoryId: string | null;
  addedCount: number;
  duplicateCount: number;
  items: PhotoLabSaveItemResult[];
};

export class PhotoLabSaveError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "PhotoLabSaveError";
  }
}

export const MAX_SAVE_TEXT_CHARS = 200;
const MAX_SAVE_CATEGORY_CHARS = 60;
export const MAX_SAVE_ITEMS = MAX_LABELS;

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, MAX_SAVE_TEXT_CHARS)
    : "";
}

/**
 * Drop half-empty pairs and repeats before anything touches the database.
 *
 * Duplicates inside one batch are collapsed case-insensitively: two chips
 * reading "Fenster" and "fenster" are the same word to a learner, and the
 * content key alone would keep both (it is case-sensitive by default).
 */
export function sanitizePhotoLabSaveItems(items: PhotoLabSaveItem[]): PhotoLabSaveItem[] {
  const seen = new Set<string>();
  const result: PhotoLabSaveItem[] = [];
  for (const item of items) {
    const known = normalizeText(item?.known);
    const target = normalizeText(item?.target);
    if (!known || !target) continue;
    const key = `${known.toLocaleLowerCase()}\u0000${target.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      known,
      target,
      audioHash: typeof item.audioHash === "string" && item.audioHash ? item.audioHash : null,
    });
    if (result.length >= MAX_SAVE_ITEMS) break;
  }
  return result;
}

function normalizePair(languageFrom: string, languageTo: string) {
  const from = normalizeLanguageCode(languageFrom);
  const to = normalizeLanguageCode(languageTo);
  if (!from || !to || from === to) {
    throw new PhotoLabSaveError("A valid language pair is required.");
  }
  return { from, to };
}

/**
 * Name of the one list this direction saves into, and whether it exists yet.
 *
 * There is deliberately no destination picker: a learner has exactly one
 * personal list per direction, which they study alongside any public lists they
 * subscribe to. Naming it before the save is what makes that model visible.
 */
export async function describePhotoLabSaveList(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
}): Promise<{ name: string; exists: boolean }> {
  const { from, to } = normalizePair(input.languageFrom, input.languageTo);
  const existing = await getPersonalList({
    userId: input.userId,
    languageFrom: from,
    languageTo: to,
  });
  return {
    name: existing?.name ?? personalListName(from, to),
    exists: Boolean(existing),
  };
}

async function findOrCreatePersonalList(
  executor: Executor,
  input: { userId: string; languageFrom: string; languageTo: string },
): Promise<WordList> {
  const existing = await getPersonalList(input, executor);
  if (existing) return existing;

  // Private and review-opted-out: the word chat asks the learner those two
  // questions before it creates this row, and Photo Lab does not ask them.
  // Creating it silently must therefore pick the conservative answer.
  await executor
    .insert(wordLists)
    .values({
      ownerId: input.userId,
      name: personalListName(input.languageFrom, input.languageTo),
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      isPersonal: true,
      isPublic: false,
      reviewOptIn: false,
    })
    .onConflictDoNothing();

  const created = await getPersonalList(input, executor);
  if (!created) {
    throw new PhotoLabSaveError("Could not create your personal word list.", 500);
  }
  return created;
}

/** Reuse a same-named category so repeated saves don't stack up empty sections. */
async function findOrCreateCategory(
  executor: Executor,
  input: { listId: string; name: string },
): Promise<string> {
  const [existing] = await executor
    .select({ id: wordCategories.id })
    .from(wordCategories)
    .where(
      and(
        eq(wordCategories.listId, input.listId),
        sql`lower(${wordCategories.name}) = lower(${input.name})`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [{ nextPosition }] = await executor
    .select({
      nextPosition: sql<number>`coalesce(max(${wordCategories.position}), -1) + 1`,
    })
    .from(wordCategories)
    .where(eq(wordCategories.listId, input.listId));

  const [category] = await executor
    .insert(wordCategories)
    .values({
      listId: input.listId,
      name: input.name,
      position: Number(nextPosition ?? 0),
    })
    .returning({ id: wordCategories.id });
  if (!category) throw new PhotoLabSaveError("Could not create the category.", 500);
  return category.id;
}

/**
 * Copy picked photo labels into the learner's personal list for this direction.
 *
 * Both sides already exist (the vision model produced the pair), so items are
 * inserted as `translated` and never enter the translation queue. Label audio
 * that was already generated is linked by content hash, which is why a saved
 * word can be pronounced immediately instead of waiting for an audio run.
 *
 * Saving twice is harmless: existing items are matched by content key inside a
 * transaction that holds the list row, so a second save adds nothing. The
 * verdict is reported per word — "this one was already there" is about a
 * specific pair, never about the batch.
 */
export async function savePhotoLabWords(input: {
  userId: string;
  languageFrom: string;
  languageTo: string;
  categoryName: string;
  items: PhotoLabSaveItem[];
}): Promise<PhotoLabSaveResult> {
  const { from, to } = normalizePair(input.languageFrom, input.languageTo);
  const items = sanitizePhotoLabSaveItems(input.items ?? []);
  if (items.length === 0) throw new PhotoLabSaveError("There is nothing to save.");

  const categoryName =
    input.categoryName?.trim().replace(/\s+/g, " ").slice(0, MAX_SAVE_CATEGORY_CHARS) ||
    "Photo lab";

  const hashes = [...new Set(items.map((item) => item.audioHash).filter((hash): hash is string => Boolean(hash)))];
  const assets = await findMediaByHashes(hashes);
  const assetIdByHash = new Map<string, string>();
  for (const [hash, asset] of assets) {
    if (isPlayableAudioAsset(asset)) assetIdByHash.set(hash, asset.id);
  }

  return db.transaction(async (tx) => {
    const list = await findOrCreatePersonalList(tx, {
      userId: input.userId,
      languageFrom: from,
      languageTo: to,
    });

    // Serializes concurrent saves into the same list, so two tabs cannot each
    // decide the same word is new.
    await tx
      .select({ id: wordLists.id })
      .from(wordLists)
      .where(eq(wordLists.id, list.id))
      .for("update");

    const existingRows = await tx
      .select({
        textKnown: wordListItems.textKnown,
        textTarget: wordListItems.textTarget,
        ignoreCase: wordListItems.ignoreCase,
      })
      .from(wordListItems)
      .where(eq(wordListItems.listId, list.id));

    const existingKeys = new Set<string>();
    for (const row of existingRows) {
      const key = await computeContentKey({
        languageFrom: list.languageFrom,
        languageTo: list.languageTo,
        textKnown: row.textKnown,
        textTarget: row.textTarget,
        ignoreCase: row.ignoreCase,
      });
      if (key) existingKeys.add(key);
    }

    const inserts: PhotoLabSaveItem[] = [];
    const outcomes: PhotoLabSaveItemResult[] = [];
    for (const item of items) {
      const key = await computeContentKey({
        languageFrom: list.languageFrom,
        languageTo: list.languageTo,
        textKnown: item.known,
        textTarget: item.target,
        ignoreCase: false,
      });
      const duplicate = !key || existingKeys.has(key);
      outcomes.push({
        known: item.known,
        target: item.target,
        outcome: duplicate ? "duplicate" : "added",
      });
      if (duplicate) continue;
      existingKeys.add(key);
      inserts.push(item);
    }

    if (inserts.length === 0) {
      return {
        listId: list.id,
        listName: list.name,
        categoryId: null,
        addedCount: 0,
        duplicateCount: items.length,
        items: outcomes,
      };
    }

    const categoryId = await findOrCreateCategory(tx, { listId: list.id, name: categoryName });

    const [{ nextItemPosition }] = await tx
      .select({
        nextItemPosition: sql<number>`coalesce(max(${wordListItems.position}), -1) + 1`,
      })
      .from(wordListItems)
      .where(eq(wordListItems.listId, list.id));
    const basePosition = Number(nextItemPosition ?? 0);

    await tx.insert(wordListItems).values(
      inserts.map((item, index) => {
        const audioAssetId = item.audioHash ? assetIdByHash.get(item.audioHash) ?? null : null;
        return {
          listId: list.id,
          categoryId,
          position: basePosition + index,
          textKnown: item.known,
          textTarget: item.target,
          translationStatus: "translated" as const,
          audioAssetId,
          audioStatus: audioAssetId ? ("ready" as const) : ("none" as const),
        };
      }),
    );

    await tx
      .update(wordLists)
      .set({ updatedAt: new Date() })
      .where(eq(wordLists.id, list.id));

    return {
      listId: list.id,
      listName: list.name,
      categoryId,
      addedCount: inserts.length,
      duplicateCount: items.length - inserts.length,
      items: outcomes,
    };
  });
}
