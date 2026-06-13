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
  sizeBytes?: number;
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
