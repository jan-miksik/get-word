import {
  getListById,
  getListItems,
  getMediaAssetsByIds,
} from "@/lib/db";
import type { MediaAsset, WordListItem } from "@/lib/db/schema";
import { computeContentHash, DEFAULT_GOOGLE_TTS_VOICE_ID } from "@/lib/audio";
import { analyzeMp3, assessClipPlausibility, isSuspiciousSizeForText } from "@/lib/audio-quality";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import { getAudio } from "@/lib/object-storage";
import { AUDIO_FORMAT } from "../batch/types";
import { generateAudioForItem } from "../batch/generate-item";

export type AudioSide = "target" | "known";

export type FlaggedItem = {
  itemId: string;
  side: AudioSide;
  text: string;
  reason: string;
  voiceId: string | null;
};

export type RepairOutcome = {
  itemId: string;
  side: AudioSide;
  status: "ok" | "error";
  error?: string;
  qualityWarning?: string;
};

const SIDES: AudioSide[] = ["target", "known"];

function sideText(item: WordListItem, side: AudioSide): string {
  return (side === "known" ? item.textKnown : item.textTarget) ?? "";
}

function sideAssetId(item: WordListItem, side: AudioSide): string | null {
  return (side === "known" ? item.knownAudioAssetId : item.audioAssetId) ?? null;
}

function sideStatus(item: WordListItem, side: AudioSide): string {
  return (side === "known" ? item.knownAudioStatus : item.audioStatus) ?? "none";
}

function sideLanguage(
  list: NonNullable<Awaited<ReturnType<typeof getListById>>>,
  side: AudioSide,
): string {
  return side === "known" ? list.languageFrom : list.languageTo;
}

/** Fetch the stored bytes for an asset (object store first, then Arweave gateway). */
async function fetchAssetBytes(asset: MediaAsset): Promise<Buffer | null> {
  if (asset.storageType === "object_store") {
    const got = await getAudio(asset.contentHash);
    return got ? Buffer.from(got.body) : null;
  }
  if (asset.storageType === "arweave") {
    for (const url of getArweaveGatewayUrls(asset.storageRef)) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
      } catch {
        // try next gateway
      }
    }
  }
  return null;
}

/**
 * Two-tier scan. The cheap DB pass only *directly* flags items whose audio is
 * missing or failed; a suspiciously small size just makes an item a candidate for
 * the deep pass, which downloads the bytes and runs the frame-level analyzer.
 */
export async function scanListAudio(
  listId: string,
  opts: { side: AudioSide | "both" } = { side: "both" },
): Promise<FlaggedItem[]> {
  const list = await getListById(listId);
  if (!list) return [];
  const items = await getListItems(listId);
  const sides = opts.side === "both" ? SIDES : [opts.side];

  const assetIds = new Set<string>();
  for (const item of items) {
    for (const side of sides) {
      const id = sideAssetId(item, side);
      if (id) assetIds.add(id);
    }
  }
  const assets = await getMediaAssetsByIds([...assetIds]);

  const flagged: FlaggedItem[] = [];
  const candidates: { item: WordListItem; side: AudioSide; asset: MediaAsset }[] = [];

  for (const item of items) {
    for (const side of sides) {
      const text = sideText(item, side);
      if (!text.trim()) continue;
      const status = sideStatus(item, side);
      const assetId = sideAssetId(item, side);
      const asset = assetId ? assets.get(assetId) : undefined;

      if (status === "failed") {
        flagged.push({ itemId: item.id, side, text, reason: "status-failed", voiceId: null });
        continue;
      }
      if (assetId && !asset) {
        flagged.push({ itemId: item.id, side, text, reason: "asset-missing", voiceId: null });
        continue;
      }
      if (!asset) continue; // no audio yet — not a repair target

      // Cheap candidate filter; the deep pass decides.
      if (isSuspiciousSizeForText(asset.sizeBytes, text)) {
        candidates.push({ item, side, asset });
      }
    }
  }

  for (const { item, side, asset } of candidates) {
    const bytes = await fetchAssetBytes(asset);
    if (!bytes) {
      flagged.push({
        itemId: item.id,
        side,
        text: sideText(item, side),
        reason: "unfetchable",
        voiceId: asset.voiceId,
      });
      continue;
    }
    const { durationMs, frameCount } = analyzeMp3(bytes);
    const verdict = assessClipPlausibility({
      buffer: bytes,
      text: sideText(item, side),
      durationMs,
      frameCount,
    });
    if (!verdict.plausible) {
      flagged.push({
        itemId: item.id,
        side,
        text: sideText(item, side),
        reason: verdict.reason ?? "suspect",
        voiceId: asset.voiceId,
      });
    }
  }

  return flagged;
}

/**
 * Re-generate audio for the given items (server-side, e.g. the admin script). Runs
 * through the normal batch generator with force, so the Part A quality autofix chain
 * applies. Keeps each clip's existing voice when known.
 */
export async function repairListAudio(
  listId: string,
  itemIds: { itemId: string; side: AudioSide }[],
  opts: { concurrency?: number } = {},
): Promise<RepairOutcome[]> {
  const list = await getListById(listId);
  if (!list) return [];
  const items = await getListItems(listId);
  const itemById = new Map(items.map((item) => [item.id, item]));

  const assetIds = new Set<string>();
  for (const item of items) {
    for (const side of SIDES) {
      const id = sideAssetId(item, side);
      if (id) assetIds.add(id);
    }
  }
  const assets = await getMediaAssetsByIds([...assetIds]);
  const provider = "google_tts";
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const outcomes: RepairOutcome[] = [];

  for (let i = 0; i < itemIds.length; i += concurrency) {
    const batch = itemIds.slice(i, i + concurrency);
    const batchOutcomes = await Promise.all(
      batch.map(async ({ itemId, side }): Promise<RepairOutcome> => {
        const item = itemById.get(itemId);
        const text = item ? sideText(item, side) : "";
        if (!item || !text.trim()) {
          return { itemId, side, status: "error", error: "item-or-text-missing" };
        }
        const language = sideLanguage(list, side);
        const existingAssetId = sideAssetId(item, side);
        const existingVoice =
          existingAssetId && assets.get(existingAssetId)?.voiceId
            ? assets.get(existingAssetId)!.voiceId
            : undefined;
        // Persisted default-voice clips store the sentinel (google:default:female),
        // not a real Google voice name — treat both it and the legacy "default"
        // string as "use the name-less default", never as a named voice to request.
        const requestVoice =
          existingVoice &&
          existingVoice !== "default" &&
          existingVoice !== DEFAULT_GOOGLE_TTS_VOICE_ID
            ? existingVoice
            : undefined;
        const hash = computeContentHash(text, language, provider, {
          voiceId: requestVoice ?? "default",
          audioFormat: AUDIO_FORMAT,
        });

        const { result } = await generateAudioForItem(
          {
            item: { id: item.id, text, language, ...(requestVoice ? { voice_id: requestVoice } : {}) },
            hash,
            replaceExisting: true,
            voiceId: requestVoice,
          },
          { provider, voiceId: requestVoice, encryptedKey: null, audioField: side, force: true },
        );

        return {
          itemId,
          side,
          status: result.status,
          error: result.error,
          qualityWarning: result.audioQualityWarning,
        };
      }),
    );
    outcomes.push(...batchOutcomes);
  }

  return outcomes;
}
