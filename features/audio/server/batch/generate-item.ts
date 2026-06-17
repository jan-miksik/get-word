import {
  createMediaAsset,
  upsertMediaAsset,
  batchLinkAudioToItems,
} from "@/lib/db";
import {
  googleTTS,
  elevenLabsTTS,
  getAudioUrl,
  GoogleTTSQuotaExhaustedError,
} from "@/lib/audio";
import { runGoogleTtsWithRetry } from "@/lib/google-tts-rate-limit";
import { uploadAudio } from "@/lib/audio-storage";
import { getErrorDetail } from "./errors";
import type { AudioField, GenerationCandidate, GeneratedResult } from "./types";

export type GenerateItemContext = {
  provider: string;
  voiceId?: string;
  encryptedKey: string | null;
  audioField: AudioField;
  force: boolean;
};

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

  try {
    let result: { audio: Buffer; sizeBytes: number } | null = null;

    if (provider === "google_tts") {
      const googleVoiceId = voiceId?.trim();
      result = await runGoogleTtsWithRetry(() =>
        googleVoiceId
          ? googleTTS(item.text, item.language, googleVoiceId)
          : googleTTS(item.text, item.language),
      );
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

    const storage = await uploadAudio(result.audio, {
      contentHash: hash,
      language: item.language,
      textReference: item.text,
      provider,
      voiceId: voiceId ?? "default",
    });

    const mediaAssetData = {
      contentHash: hash,
      storageType: storage.storageType,
      storageRef: storage.storageRef,
      mediaType: "audio" as const,
      language: item.language,
      textReference: item.text,
      provider: provider as "google_tts" | "elevenlabs",
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
        arweaveUrl: storage.gatewayUrl,
        arweaveUrls: storage.gatewayUrls,
        storageRef: storage.storageRef,
        voiceId: voiceId ?? "default",
        sizeBytes: result.sizeBytes,
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
