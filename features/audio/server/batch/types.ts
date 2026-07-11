export type AudioItem = {
  id: string;
  text: string;
  language: string;
  /** Optional per-item voice override (used by "Mix voices"); falls back to the batch voice. */
  voice_id?: string;
};

export type AudioField = "known" | "target";

export const MAX_ITEMS = 200;
export const CONCURRENCY = 3;
export const AUDIO_FORMAT = "mp3";

/** Per-clip cap for inlining freshly-synthesized bytes in the response (bytes). */
export const INLINE_MAX_BYTES = (() => {
  const raw = Number.parseInt(process.env.AUDIO_INLINE_MAX_BYTES ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 350_000;
})();

/** Per-response budget for all inlined bytes combined (bytes). */
export const INLINE_TOTAL_MAX_BYTES = (() => {
  const raw = Number.parseInt(process.env.AUDIO_INLINE_TOTAL_MAX_BYTES ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 6_000_000;
})();
export const PARTIAL_QUOTA_MESSAGE =
  "This list needs more Google TTS characters than this account has left in the free quota. Only part of the list can be generated now. Contact our tech support and we can help finish the list or raise the limit.";

export type DedupLink = {
  itemId: string;
  hash: string;
  audioAssetId: string;
  audioUrl: string;
  arweaveUrl?: string;
  arweaveUrls?: string[];
  storageRef?: string;
  voiceId?: string | null;
};

export type GenerationCandidate = {
  item: AudioItem;
  hash: string;
  replaceExisting?: boolean;
  /** Resolved voice for this item (per-item override or batch default). */
  voiceId?: string;
};

export type GeneratedResult = {
  itemId: string;
  hash: string;
  status: "ok" | "error";
  audioUrl?: string;
  arweaveUrl?: string;
  arweaveUrls?: string[];
  storageRef?: string;
  voiceId?: string | null;
  sizeBytes?: number;
  /**
   * Set on a durably-stored ("ok") clip when the quality autofix could not produce
   * a clip that passes the plausibility check — a soft "please check" signal, NOT a
   * storage failure. `status` stays the authoritative durable-storage result.
   */
  audioQualityWarning?: string;
  /**
   * Freshly-synthesized bytes (base64) for a durably-stored clip within the per-clip
   * inline cap, so the editor can play instantly without waiting on Arweave
   * propagation / the B2 mirror. Omitted for dedup hits and oversized clips; may be
   * stripped by generate-batch once the per-response budget is spent.
   */
  audioBase64?: string;
  /**
   * Set when the clip is durable via Arweave but the B2 mirror upload failed; carries
   * the failure category (permission/too_large/timeout/network/…) so generate-batch
   * can surface a non-fatal object_mirror_warning.
   */
  mirrorFailedCategory?: string;
  /**
   * Extra Google TTS usage the quality autofix incurred *beyond* the single call the
   * batch reserved for this item (each fallback attempt is one more call). generate-batch
   * trues up the quota with these so autofix retries aren't undercounted. Internal —
   * not mapped into the JSON response.
   */
  extraGoogleUnits?: number;
  extraGoogleRequests?: number;
  error?: string;
};

export type QuotaLimit = {
  code: string;
  message: string;
  requested_units: number;
  allowed_units: number;
  skipped_items: number;
  usage: {
    used_units: number;
    account_limit: number;
    free_monthly_units: number;
    period_start: string;
  };
};
