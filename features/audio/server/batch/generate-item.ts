import {
  createMediaAsset,
  findMediaByHash,
  upsertMediaAsset,
  batchLinkAudioToItems,
} from "@/lib/db";
import {
  googleTTS,
  elevenLabsTTS,
  getAudioUrl,
  GoogleTTSQuotaExhaustedError,
  DEFAULT_GOOGLE_TTS_VOICE_ID,
} from "@/lib/audio";
import { runGoogleTtsWithRetry } from "@/lib/google-tts-rate-limit";
import { analyzeMp3, assessClipPlausibility } from "@/lib/audio-quality";
import { getGoogleFallbackVoices } from "@/lib/language-catalog";
import {
  getArweaveGatewayUrl,
  getArweaveGatewayUrls,
  uploadAudio,
} from "@/lib/audio-storage";
import {
  getActiveObjectStorageProvider,
  objectKeyForHash,
  putAudioResult,
} from "@/lib/object-storage";
import { getErrorDetail } from "./errors";
import {
  INLINE_MAX_BYTES,
  type AudioField,
  type GenerationCandidate,
  type GeneratedResult,
} from "./types";

export type GenerateItemContext = {
  provider: string;
  voiceId?: string;
  encryptedKey: string | null;
  audioField: AudioField;
  force: boolean;
};

function hasUsableArweaveRef(
  asset: Awaited<ReturnType<typeof findMediaByHash>>,
): asset is NonNullable<typeof asset> {
  return asset?.storageType === "arweave" && asset.storageRef.trim().length > 0;
}

type GoogleAttempt = {
  audio: Buffer;
  sizeBytes: number;
  frameCount: number;
  durationMs: number;
  voiceLabel: string;
};

type GoogleAutofixResult = {
  audio: Buffer;
  sizeBytes: number;
  actualVoiceUsed: string;
  qualityWarning?: string;
  fallbackUsed: boolean;
};

/**
 * Generate Google TTS audio and, when the clip looks broken (empty / truncated /
 * suspiciously short — see lib/audio-quality), automatically re-generate with a
 * Studio voice, then Google's default voice, keeping the first plausible result.
 * The content hash / dedup identity is unchanged — the requested voice stays the
 * cache key; we just store the best audio we could synthesize under it.
 */
async function generateGoogleAudioWithAutofix(
  text: string,
  language: string,
  requestedVoiceLabel: string | undefined,
): Promise<GoogleAutofixResult | null> {
  const requestedNamedVoice =
    requestedVoiceLabel && requestedVoiceLabel !== "default" ? requestedVoiceLabel : undefined;

  // Ordered, deduped candidate voices. Each entry's `voiceParam` is what we pass to
  // googleTTS (undefined = default name-less female); `label` is what we persist.
  const candidates: { voiceParam: string | undefined; label: string }[] = [
    {
      voiceParam: requestedNamedVoice,
      label: requestedNamedVoice ?? DEFAULT_GOOGLE_TTS_VOICE_ID,
    },
  ];

  const runAttempt = async (
    voiceParam: string | undefined,
    label: string,
  ): Promise<GoogleAttempt | null> => {
    const clip = await runGoogleTtsWithRetry(() =>
      voiceParam ? googleTTS(text, language, voiceParam) : googleTTS(text, language),
    );
    if (!clip) return null;
    const { durationMs, frameCount } = analyzeMp3(clip.audio);
    return { ...clip, durationMs, frameCount, voiceLabel: label };
  };

  const attempts: GoogleAttempt[] = [];
  const first = await runAttempt(candidates[0].voiceParam, candidates[0].label);
  if (!first) return null;
  attempts.push(first);

  let verdict = assessClipPlausibility({
    buffer: first.audio,
    text,
    durationMs: first.durationMs,
    frameCount: first.frameCount,
  });

  if (verdict.plausible) {
    return {
      audio: first.audio,
      sizeBytes: first.sizeBytes,
      actualVoiceUsed: first.voiceLabel,
      fallbackUsed: false,
    };
  }

  // Suspect — build the fallback chain (Studio → Standard → default), skipping any
  // voice we've already tried.
  const { studio, standard } = await getGoogleFallbackVoices(language);
  const fallbackCandidates: { voiceParam: string | undefined; label: string }[] = [];
  const tried = new Set(candidates.map((c) => c.label));
  const consider = (voiceParam: string | undefined, label: string) => {
    if (tried.has(label)) return;
    tried.add(label);
    fallbackCandidates.push({ voiceParam, label });
  };
  if (studio) consider(studio, studio);
  if (standard) consider(standard, standard);
  consider(undefined, DEFAULT_GOOGLE_TTS_VOICE_ID);

  const firstReason = verdict.reason;
  const attemptedLabels = [first.voiceLabel];

  for (const candidate of fallbackCandidates) {
    const attempt = await runAttempt(candidate.voiceParam, candidate.label);
    if (!attempt) continue;
    attempts.push(attempt);
    attemptedLabels.push(attempt.voiceLabel);
    verdict = assessClipPlausibility({
      buffer: attempt.audio,
      text,
      durationMs: attempt.durationMs,
      frameCount: attempt.frameCount,
    });
    if (verdict.plausible) {
      return {
        audio: attempt.audio,
        sizeBytes: attempt.sizeBytes,
        actualVoiceUsed: attempt.voiceLabel,
        fallbackUsed: true,
      };
    }
  }

  // Nothing passed. Keep the best-effort attempt (longest with real frames) but flag
  // it — never silently pass off a suspect clip as fully good.
  const playable = attempts.filter((a) => a.frameCount > 0);
  if (playable.length === 0) return null; // caller turns this into status:"error"

  const best = playable.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
  return {
    audio: best.audio,
    sizeBytes: best.sizeBytes,
    actualVoiceUsed: best.voiceLabel,
    fallbackUsed: true,
    qualityWarning: `low-quality (${firstReason ?? "suspect"}); tried voices: ${attemptedLabels.join(", ")}`,
  };
}

/**
 * Generates and stores audio for a single item, linking the resulting asset.
 * Returns the per-item result plus, when Google's quota is exhausted mid-run,
 * the message that should halt remaining generation.
 */
export async function generateAudioForItem(
  { item, hash, replaceExisting, voiceId: itemVoiceId }: GenerationCandidate,
  ctx: GenerateItemContext,
): Promise<{ result: GeneratedResult; quotaExhausted?: string }> {
  const { provider, encryptedKey, audioField, force } = ctx;
  const voiceId = itemVoiceId ?? ctx.voiceId;
  const audioFieldPatch = audioField === "known" ? { audioField } : {};
  const requestedVoiceLabel = voiceId?.trim();

  try {
    let result: { audio: Buffer; sizeBytes: number } | null = null;
    // The voice that actually produced the stored audio (may differ from requested
    // after an autofix fallback). Google default → sentinel; ElevenLabs → its voice.
    let actualVoiceUsed: string | null =
      requestedVoiceLabel && requestedVoiceLabel !== "default" ? requestedVoiceLabel : null;
    let audioQualityWarning: string | undefined;

    if (provider === "google_tts") {
      const autofixed = await generateGoogleAudioWithAutofix(
        item.text,
        item.language,
        requestedVoiceLabel,
      );
      if (autofixed) {
        result = { audio: autofixed.audio, sizeBytes: autofixed.sizeBytes };
        actualVoiceUsed = autofixed.actualVoiceUsed;
        audioQualityWarning = autofixed.qualityWarning;
        if (autofixed.fallbackUsed) {
          console.info("[Get Word audio] quality autofix applied", {
            itemId: item.id,
            text: item.text,
            language: item.language,
            requestedVoice: requestedVoiceLabel ?? DEFAULT_GOOGLE_TTS_VOICE_ID,
            actualVoiceUsed: autofixed.actualVoiceUsed,
            qualityWarning: autofixed.qualityWarning ?? null,
          });
        }
      }
    } else if (provider === "elevenlabs" && encryptedKey) {
      result = await elevenLabsTTS(
        item.text,
        item.language,
        encryptedKey,
        voiceId ?? "default",
      );
    }

    if (!result) {
      await batchLinkAudioToItems([
        {
          itemId: item.id,
          audioAssetId: null,
          audioStatus: "failed",
          ...audioFieldPatch,
        },
      ]);
      return {
        result: {
          itemId: item.id,
          hash,
          status: "error",
          error: "TTS provider returned no audio",
        },
      };
    }

    let storageType: "arweave" | "object_store";
    let storageProvider: "b2" | null = null;
    let storageRef: string;
    let gatewayUrl = "";
    let gatewayUrls: string[] = [];

    const [uploadResult, objectMirrorResult] = await Promise.allSettled([
      uploadAudio(result.audio, {
        contentHash: hash,
        language: item.language,
        textReference: item.text,
        provider,
        voiceId: voiceId ?? "default",
      }),
      putAudioResult(result.audio, hash),
    ]);

    const mirrorOutcome =
      objectMirrorResult.status === "fulfilled"
        ? objectMirrorResult.value
        : { ok: false, category: "exception" as string };
    const mirroredToObjectStore = mirrorOutcome.ok;
    // Category surfaced when the durable ref is Arweave but the B2 mirror failed,
    // so the batch can report *why* (permission/too_large/timeout/network/…).
    const mirrorFailureCategory = mirrorOutcome.ok ? undefined : mirrorOutcome.category;

    if (uploadResult.status === "fulfilled") {
      const storage = uploadResult.value;
      storageType = storage.storageType;
      storageRef = storage.storageRef;
      gatewayUrl = storage.gatewayUrl;
      gatewayUrls = storage.gatewayUrls;
    } else {
      if (!mirroredToObjectStore) {
        throw uploadResult.reason;
      }
      const existing = await findMediaByHash(hash);
      if (hasUsableArweaveRef(existing)) {
        storageType = "arweave";
        storageRef = existing.storageRef;
        gatewayUrl = getArweaveGatewayUrl(existing.storageRef);
        gatewayUrls = getArweaveGatewayUrls(existing.storageRef);
        console.warn("[Get Word audio] object mirror refreshed, canonical Arweave ref preserved", {
          contentHash: hash,
          storageRef: existing.storageRef,
          itemId: item.id,
        });
      } else {
        storageType = "object_store";
        storageProvider = getActiveObjectStorageProvider();
        storageRef = objectKeyForHash(hash);
      }
    }

    const mediaAssetData = {
      contentHash: hash,
      storageType,
      storageProvider,
      storageRef,
      mediaType: "audio" as const,
      language: item.language,
      textReference: item.text,
      provider: provider as "google_tts" | "elevenlabs",
      voiceId: actualVoiceUsed,
      sizeBytes: result.sizeBytes,
    };

    const asset = force || replaceExisting
      ? await upsertMediaAsset(mediaAssetData)
      : await createMediaAsset(mediaAssetData);

    await batchLinkAudioToItems([
      {
        itemId: item.id,
        audioAssetId: asset.id,
        audioStatus: "ready",
        ...audioFieldPatch,
      },
    ]);

    return {
      result: {
        itemId: item.id,
        hash,
        status: "ok",
        audioUrl: getAudioUrl(hash),
        arweaveUrl: gatewayUrl,
        arweaveUrls: gatewayUrls,
        storageRef,
        voiceId: actualVoiceUsed ?? "default",
        sizeBytes: result.sizeBytes,
        // Durable via Arweave, but the B2 mirror failed — report the reason so the
        // batch can warn without failing the item.
        ...(storageType === "arweave" && mirrorFailureCategory
          ? { mirrorFailedCategory: mirrorFailureCategory }
          : {}),
        ...(audioQualityWarning ? { audioQualityWarning } : {}),
        // Inline the bytes for instant local playback, but only for clips within the
        // per-clip cap. The whole-batch budget is enforced later in generate-batch.
        ...(result.sizeBytes <= INLINE_MAX_BYTES
          ? { audioBase64: result.audio.toString("base64") }
          : {}),
      },
    };
  } catch (err) {
    const quotaExhausted =
      err instanceof GoogleTTSQuotaExhaustedError ? err.message : undefined;
    const detail = getErrorDetail(err);
    console.error("[Get Word audio] item generation failed", {
      itemId: item.id,
      language: item.language,
      provider,
      detail,
      error: err instanceof Error ? err.message : err,
    });
    await batchLinkAudioToItems([
      {
        itemId: item.id,
        audioAssetId: null,
        audioStatus: "failed",
        ...audioFieldPatch,
      },
    ]);
    return {
      result: {
        itemId: item.id,
        hash,
        status: "error",
        error: detail,
      },
      quotaExhausted,
    };
  }
}
