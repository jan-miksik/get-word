import type {
  AudioItem,
  DedupLink,
  GeneratedResult,
  QuotaLimit,
} from "./types";

/**
 * Maps the original request items back to their final per-item response,
 * preferring deduplicated assets, then freshly generated audio, then an error.
 */
export function buildBatchResults(
  items: AudioItem[],
  dedupLinks: DedupLink[],
  generatedResults: GeneratedResult[],
  quotaLimit: QuotaLimit | undefined,
) {
  return items.map((item) => {
    const dedup = dedupLinks.find((d) => d.itemId === item.id);
    if (dedup) {
      return {
        id: item.id,
        content_hash: dedup.hash,
        audio_url: dedup.audioUrl,
        arweave_url: dedup.arweaveUrl,
        arweave_urls: dedup.arweaveUrls,
        storage_ref: dedup.storageRef,
        voice_id: dedup.voiceId ?? null,
        status: "ok" as const,
        source: "dedup" as const,
      };
    }
    const gen = generatedResults.find((g) => g.itemId === item.id);
    if (gen) {
      return {
        id: item.id,
        content_hash: gen.hash,
        audio_url: gen.audioUrl ?? null,
        arweave_url: gen.arweaveUrl,
        arweave_urls: gen.arweaveUrls,
        storage_ref: gen.storageRef,
        voice_id: gen.voiceId ?? item.voice_id ?? null,
        size_bytes: gen.sizeBytes,
        status: gen.status,
        ...(gen.audioQualityWarning ? { audio_quality_warning: gen.audioQualityWarning } : {}),
        ...(gen.audioBase64 ? { audio_base64: gen.audioBase64 } : {}),
        ...(gen.error ? { error: gen.error } : {}),
        source: "generated" as const,
      };
    }
    return {
      id: item.id,
      audio_url: null,
      status: "error" as const,
      error: quotaLimit ? quotaLimit.message : "Not processed",
      source: "generated" as const,
    };
  });
}
