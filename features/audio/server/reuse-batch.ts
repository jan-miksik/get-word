import {
  batchLinkAudioToItems,
  findMediaByHashes,
  findMediaVariantsByText,
} from "@/lib/db";
import { DEFAULT_GOOGLE_TTS_VOICE_ID, computeContentHash, getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import { isPlayableAudioAsset } from "@/lib/audio-assets";

export type AudioReuseItem = {
  id: string;
  text: string;
  language: string;
  selected_asset_id?: string;
  voice_id?: string;
};

const MAX_ITEMS = 200;
const AUDIO_FORMAT = "mp3";

export class AudioReuseBatchError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "AudioReuseBatchError";
  }
}

function normalizeRequestedVoice(value: string | undefined): string | undefined {
  return value && value !== "default" && value !== DEFAULT_GOOGLE_TTS_VOICE_ID ? value : undefined;
}

export async function reuseAudioBatch(body: Record<string, unknown>) {
  const { items, provider, voice_id } = body as {
    items?: AudioReuseItem[];
    provider?: string;
    voice_id?: string;
    link?: boolean;
    audio_field?: "known" | "target";
  };
  const shouldLink = body.link === true;
  const audioField = body.audio_field === "known" ? "known" : "target";

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new AudioReuseBatchError("items array is required and must not be empty");
  }

  if (items.length > MAX_ITEMS) {
    throw new AudioReuseBatchError(`Maximum ${MAX_ITEMS} items per request`);
  }

  if (!provider || !["google_tts", "elevenlabs"].includes(provider)) {
    throw new AudioReuseBatchError("provider must be 'google_tts' or 'elevenlabs'");
  }

  const hashes = items.map((item) =>
    computeContentHash(item.text, item.language, provider, {
      voiceId: normalizeRequestedVoice(item.voice_id ?? voice_id) ?? "default",
      audioFormat: AUDIO_FORMAT,
    }),
  );
  const [existingMedia, reusableVariants] = await Promise.all([
    findMediaByHashes(hashes),
    findMediaVariantsByText(items.map((item) => ({
      text: item.text,
      language: item.language,
    }))),
  ]);

  const linkUpdates: {
    itemId: string;
    audioAssetId: string | null;
    audioStatus: "ready";
  }[] = [];

  const results = items.map((item, index) => {
    const hash = hashes[index];
    const requestedVoiceId = normalizeRequestedVoice(item.voice_id ?? voice_id) ?? "default";
    const exactAsset = existingMedia.get(hash);
    const variants =
      reusableVariants.get(`${item.language}\u0000${item.text}`) ?? [];
    const playableVariants = variants.filter(isPlayableAudioAsset);
    const playableExactAsset = isPlayableAudioAsset(exactAsset) ? exactAsset : undefined;
    const selectedAsset =
      playableVariants.find((asset) => asset.id === item.selected_asset_id)
      ?? playableExactAsset
      ?? playableVariants[0];

    if (!selectedAsset) {
      return {
        id: item.id,
        content_hash: hash,
        status: "missing" as const,
        audio_url: null,
        matches: [],
      };
    }

    if (shouldLink) {
      linkUpdates.push({
        itemId: item.id,
        audioAssetId: selectedAsset.id,
        audioStatus: "ready",
        ...(audioField === "known" ? { audioField } : {}),
      });
    }

    const rawVariants = playableVariants.some((asset) => asset.id === selectedAsset.id)
      ? playableVariants
      : [selectedAsset, ...playableVariants];

    const matches = rawVariants.map((asset) => {
      const arweaveUrls =
        asset.storageType === "arweave"
          ? getArweaveGatewayUrls(asset.storageRef)
          : [];

      return {
        asset_id: asset.id,
        content_hash: asset.contentHash,
        audio_url: getAudioUrl(asset.contentHash),
        arweave_url: arweaveUrls[0] ?? null,
        arweave_urls: arweaveUrls,
        storage_ref: asset.storageRef,
        provider: asset.provider,
        voice_id: asset.voiceId ?? null,
        size_bytes: asset.sizeBytes,
      };
    });

    const selectedMatch =
      matches.find((match) => match.asset_id === selectedAsset.id)
      ?? matches[0];

    return {
      id: item.id,
      content_hash: selectedAsset.contentHash,
      status: "found" as const,
      audio_url: selectedMatch?.audio_url ?? null,
      arweave_url: selectedMatch?.arweave_url ?? null,
      arweave_urls: selectedMatch?.arweave_urls ?? [],
      storage_ref: selectedMatch?.storage_ref ?? null,
      provider: selectedMatch?.provider ?? null,
      size_bytes: selectedMatch?.size_bytes,
      // Prefer the voice actually stored on the asset; fall back to the requested
      // voice only for pre-migration rows (null voiceId) whose hash matches.
      voice_id:
        selectedAsset.voiceId
        ?? (selectedAsset.contentHash === hash ? requestedVoiceId : null),
      asset_id: selectedAsset.id,
      selected_asset_id: selectedAsset.id,
      matches,
      linked: shouldLink,
    };
  });

  if (linkUpdates.length > 0) {
    await batchLinkAudioToItems(linkUpdates);
  }

  return {
    results,
    found_count: results.filter((result) => result.status === "found").length,
    linked_count: linkUpdates.length,
  };
}
