import { GoogleTTSQuotaExhaustedError, computeContentHash, googleTTS } from "@/lib/audio";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import { uploadAudio } from "@/lib/audio-storage";
import {
  countGoogleApiTextUnits,
  createMediaAsset,
  findMediaByHash,
  findMediaByHashes,
  reserveGoogleApiUsage,
  upsertMediaAsset,
} from "@/lib/db";
import { AUDIO_FORMAT } from "@/features/audio/server/batch/types";
import { runGoogleTtsWithRetry } from "@/lib/google-tts-rate-limit";
import { getGoogleChirp3HdVoices } from "@/lib/language-catalog";
import {
  getActiveObjectStorageProvider,
  objectKeyForHash,
  putAudioResult,
} from "@/lib/object-storage";
import { DailyLimitError, reservePhotoLabAudioRateLimit } from "./rate-limit";

const CONCURRENCY = 3;
const PROVIDER = "google_tts" as const;
const DEFAULT_VOICE_ID = "default";

export type PhotoLabAudioItem = { id: string; text: string };
export type PhotoLabAudioResult = { id: string; hash: string | null };

/**
 * Deterministic voice per word: the same text always maps to the same
 * Chirp3-HD voice, so clips stay cacheable across users and sessions while the
 * overall photo still gets a mix of voices. FNV-1a keeps it dependency-free.
 */
export function pickVoiceForText(text: string, voices: string[]): string {
  if (voices.length === 0) return DEFAULT_VOICE_ID;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return voices[(hash >>> 0) % voices.length];
}

/**
 * Generate (or find) TTS audio for photo-lab labels. Items are grouped by
 * content hash so each unique clip is looked up / generated at most once; a
 * hash is only ever returned when /api/audio/[hash] can actually serve it
 * (durable storage confirmed). Per-item failures degrade to `hash: null`.
 */
export async function generatePhotoLabAudio({
  userId,
  language,
  items,
}: {
  userId: string;
  language: string;
  items: PhotoLabAudioItem[];
}): Promise<{ results: PhotoLabAudioResult[] }> {
  // Chirp3-HD voice mix; an unavailable catalog degrades to the default voice.
  const chirpVoices = await getGoogleChirp3HdVoices(language).catch(() => []);

  const groups = new Map<string, { text: string; voiceId: string; ids: string[] }>();
  for (const item of items) {
    const voiceId = pickVoiceForText(item.text, chirpVoices);
    const hash = computeContentHash(item.text, language, PROVIDER, {
      voiceId,
      audioFormat: AUDIO_FORMAT,
    });
    const group = groups.get(hash);
    if (group) {
      group.ids.push(item.id);
    } else {
      groups.set(hash, { text: item.text, voiceId, ids: [item.id] });
    }
  }

  const existing = await findMediaByHashes([...groups.keys()]);
  const resolved = new Map<string, string | null>();
  const missing: { hash: string; text: string; voiceId: string }[] = [];
  for (const [hash, group] of groups) {
    if (isPlayableAudioAsset(existing.get(hash))) {
      resolved.set(hash, hash);
    } else {
      missing.push({ hash, text: group.text, voiceId: group.voiceId });
    }
  }

  if (missing.length > 0 && (await reserveAudioBudget(userId, missing))) {
    // Google's per-minute pacing lives in runGoogleTtsWithRetry; a mid-run
    // quota exhaustion stops the remaining clips instead of hammering the API.
    let halted = false;
    for (let i = 0; i < missing.length; i += CONCURRENCY) {
      const batch = missing.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map(async (candidate) => {
          if (halted) return { hash: candidate.hash, ok: false, halt: false };
          return generateClip(candidate.hash, candidate.text, language, candidate.voiceId);
        }),
      );
      for (const outcome of outcomes) {
        resolved.set(outcome.hash, outcome.ok ? outcome.hash : null);
        if (outcome.halt) halted = true;
      }
    }
  } else {
    for (const candidate of missing) resolved.set(candidate.hash, null);
  }

  const results: PhotoLabAudioResult[] = [];
  for (const [hash, group] of groups) {
    const finalHash = resolved.get(hash) ?? null;
    for (const id of group.ids) results.push({ id, hash: finalHash });
  }
  return { results };
}

/**
 * Reserve the photo-lab daily bucket and the per-user Google TTS quota for the
 * clips that actually need generation. Returns false when either budget is
 * exhausted (cache hits are unaffected). Quota *tracking* failures don't block
 * generation — mirroring the batch route, the calls proceed and the error is
 * logged.
 */
async function reserveAudioBudget(
  userId: string,
  missing: { hash: string; text: string }[],
): Promise<boolean> {
  try {
    await reservePhotoLabAudioRateLimit(userId, missing.length);
  } catch (err) {
    if (err instanceof DailyLimitError) return false;
    throw err;
  }

  try {
    const quota = await reserveGoogleApiUsage({
      userId,
      scope: "tts",
      units: countGoogleApiTextUnits(missing.map((candidate) => candidate.text)),
      requestCount: missing.length,
    });
    return quota.allowed;
  } catch (err) {
    console.error("[photo-lab audio] Google TTS quota check failed", {
      error: err instanceof Error ? err.message : err,
    });
    return true;
  }
}

type ClipOutcome = { hash: string; ok: boolean; halt: boolean };

async function generateClip(
  hash: string,
  text: string,
  language: string,
  voiceId: string,
): Promise<ClipOutcome> {
  const namedVoice = voiceId !== DEFAULT_VOICE_ID ? voiceId : undefined;
  try {
    const result = await runGoogleTtsWithRetry(() => googleTTS(text, language, namedVoice));
    if (!result) return { hash, ok: false, halt: false };

    const [uploadResult, mirrorResult] = await Promise.allSettled([
      uploadAudio(result.audio, {
        contentHash: hash,
        language,
        textReference: text,
        provider: PROVIDER,
        voiceId,
      }),
      putAudioResult(result.audio, hash),
    ]);
    const mirrored =
      mirrorResult.status === "fulfilled" && mirrorResult.value.ok;

    // Durable gating: without at least one confirmed store there is no media
    // row and no hash — a speaker button must never point at nothing.
    let storageType: "arweave" | "object_store";
    let storageProvider: "b2" | null = null;
    let storageRef: string;
    if (uploadResult.status === "fulfilled") {
      storageType = uploadResult.value.storageType;
      storageRef = uploadResult.value.storageRef;
    } else if (mirrored) {
      storageType = "object_store";
      storageProvider = getActiveObjectStorageProvider();
      storageRef = objectKeyForHash(hash);
    } else {
      console.error("[photo-lab audio] no durable storage for clip", {
        hash,
        language,
        uploadError:
          uploadResult.status === "rejected" ? String(uploadResult.reason) : undefined,
      });
      return { hash, ok: false, halt: false };
    }

    const mediaAssetData = {
      contentHash: hash,
      storageType,
      storageProvider,
      storageRef,
      mediaType: "audio",
      language,
      textReference: text,
      provider: PROVIDER,
      voiceId: namedVoice ?? null,
      sizeBytes: result.sizeBytes,
    } as const;

    try {
      const asset = await createMediaAsset(mediaAssetData);
      if (isPlayableAudioAsset(asset)) {
        return { hash, ok: true, halt: false };
      }

      // createMediaAsset returns an existing row on conflict. Repair legacy
      // unplayable rows with the durable storage this request just confirmed.
      const repaired = await upsertMediaAsset(mediaAssetData);
      return { hash, ok: isPlayableAudioAsset(repaired), halt: false };
    } catch {
      // Unique-hash race with a concurrent generation — trust the winner's row
      // only if it is actually playable (durable rule holds here too).
      const raced = await findMediaByHash(hash);
      return { hash, ok: isPlayableAudioAsset(raced), halt: false };
    }
  } catch (err) {
    console.error("[photo-lab audio] clip generation failed", {
      hash,
      language,
      error: err instanceof Error ? err.message : String(err),
    });
    // runGoogleTtsWithRetry rethrows quota exhaustion after its retry budget —
    // no point attempting the remaining clips this request.
    return { hash, ok: false, halt: err instanceof GoogleTTSQuotaExhaustedError };
  }
}
