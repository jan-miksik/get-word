import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  mediaAssets,
  wordListItems,
  type MediaAsset,
  type NewMediaAsset,
} from "../schema";

export type AudioLinkField = "target" | "known";

function getAudioLinkUpdate(
  audioAssetId: string | null,
  audioStatus: "none" | "pending" | "ready" | "failed",
  audioField: AudioLinkField = "target",
) {
  if (audioField === "known") {
    return {
      knownAudioAssetId: audioAssetId,
      knownAudioStatus: audioStatus,
      updatedAt: new Date(),
    };
  }

  return {
    audioAssetId,
    audioStatus,
    updatedAt: new Date(),
  };
}

/** Find a media asset by content hash (for dedup). */
export async function findMediaByHash(
  contentHash: string,
): Promise<MediaAsset | null> {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.contentHash, contentHash))
    .limit(1);
  return row ?? null;
}

/** Find media assets by multiple content hashes (batch dedup). */
export async function findMediaByHashes(
  hashes: string[],
): Promise<Map<string, MediaAsset>> {
  if (hashes.length === 0) return new Map();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.contentHash, hashes));
  const map = new Map<string, MediaAsset>();
  for (const row of rows) {
    map.set(row.contentHash, row);
  }
  return map;
}

export function getVariantLookupKey(textReference: string, language: string) {
  return `${language}\u0000${textReference}`;
}

/** Find all saved audio variants for each requested text/language pair. */
export async function findMediaVariantsByText(
  entries: { text: string; language: string }[],
): Promise<Map<string, MediaAsset[]>> {
  if (entries.length === 0) return new Map();

  const textReferences = Array.from(new Set(entries.map((entry) => entry.text)));
  const languages = Array.from(new Set(entries.map((entry) => entry.language)));
  const requestedKeys = new Set(
    entries.map((entry) => getVariantLookupKey(entry.text, entry.language)),
  );

  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        inArray(mediaAssets.textReference, textReferences),
        inArray(mediaAssets.language, languages),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt));

  const grouped = new Map<string, MediaAsset[]>();
  for (const row of rows) {
    const key = getVariantLookupKey(row.textReference, row.language);
    if (!requestedKeys.has(key)) continue;
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return grouped;
}

/** Create a new media asset. */
export async function createMediaAsset(
  data: Omit<NewMediaAsset, "id" | "createdAt">,
): Promise<MediaAsset> {
  const [asset] = await db
    .insert(mediaAssets)
    .values(data)
    .onConflictDoNothing({ target: mediaAssets.contentHash })
    .returning();

  if (asset) return asset;

  const existing = await findMediaByHash(data.contentHash);
  if (!existing) {
    throw new Error("Failed to create or load media asset");
  }
  return existing;
}

/** Create a media asset or replace the stored object for the same content hash. */
export async function upsertMediaAsset(
  data: Omit<NewMediaAsset, "id" | "createdAt">,
): Promise<MediaAsset> {
  const [asset] = await db
    .insert(mediaAssets)
    .values(data)
    .onConflictDoUpdate({
      target: mediaAssets.contentHash,
      set: {
        storageType: data.storageType,
        storageProvider: data.storageProvider,
        storageRef: data.storageRef,
        mediaType: data.mediaType,
        language: data.language,
        textReference: data.textReference,
        provider: data.provider,
        voiceId: data.voiceId,
        sizeBytes: data.sizeBytes,
        createdAt: new Date(),
      },
    })
    .returning();

  if (!asset) {
    throw new Error("Failed to create or replace media asset");
  }

  return asset;
}

/** Batch link audio assets to word_list_items. */
export async function batchLinkAudioToItems(
  updates: {
    itemId: string;
    audioAssetId: string | null;
    audioStatus: "none" | "pending" | "ready" | "failed";
    audioField?: AudioLinkField;
  }[],
): Promise<void> {
  for (const { itemId, audioAssetId, audioStatus, audioField } of updates) {
    await db
      .update(wordListItems)
      .set(getAudioLinkUpdate(audioAssetId, audioStatus, audioField))
      .where(eq(wordListItems.id, itemId));
  }
}

/** Get media assets by ID. */
export async function getMediaAssetsByIds(
  ids: string[],
): Promise<Map<string, MediaAsset>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}
