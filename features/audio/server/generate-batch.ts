import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import {
  countGoogleApiTextUnits,
  findMediaByHashes,
  createMediaAsset,
  upsertMediaAsset,
  batchLinkAudioToItems,
  reserveGoogleApiUsage,
} from "@/lib/db";
import {
  computeContentHash,
  googleTTS,
  elevenLabsTTS,
  getAudioUrl,
  GoogleTTSQuotaExhaustedError,
} from "@/lib/audio";
import { getArweaveGatewayUrls, uploadAudio } from "@/lib/audio-storage";
import { getUserApiKey } from "@/lib/translation";

type AudioItem = {
  id: string;
  text: string;
  language: string;
};

const MAX_ITEMS = 200;
const CONCURRENCY = 3;
const AUDIO_FORMAT = "mp3";
const PARTIAL_QUOTA_MESSAGE =
  "This list needs more Google TTS characters than this account has left in the free quota. Only part of the list can be generated now. Contact our tech support and we can help finish the list or raise the limit.";

function getErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown error";
  const cause = err.cause;
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  if (
    cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
  ) {
    return cause.message;
  }
  return err.message;
}

export async function handleGenerateAudioBatch(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { items, provider, voice_id } = body as {
    items?: AudioItem[];
    provider?: string;
    voice_id?: string;
    force?: boolean;
    allow_partial?: boolean;
    audio_field?: "known" | "target";
  };
  const force = body.force === true;
  const allowPartial = body.allow_partial === true;
  const audioField = body.audio_field === "known" ? "known" : "target";

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "items array is required and must not be empty" },
      { status: 400 },
    );
  }

  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ITEMS} items per request` },
      { status: 400 },
    );
  }

  if (!provider || !["google_tts", "elevenlabs"].includes(provider)) {
    return NextResponse.json(
      { error: "provider must be 'google_tts' or 'elevenlabs'" },
      { status: 400 },
    );
  }

  let encryptedKey: string | null = null;
  if (provider === "elevenlabs") {
    encryptedKey = await getUserApiKey(user.id, "elevenlabs");
    if (!encryptedKey) {
      return NextResponse.json(
        { error: "ElevenLabs requires a stored API key. Add your key in settings." },
        { status: 400 },
      );
    }
  }

  const hashes = items.map((item) =>
    computeContentHash(item.text, item.language, provider, {
      voiceId: voice_id ?? "default",
      audioFormat: AUDIO_FORMAT,
    }),
  );
  const existingMedia = force ? new Map() : await findMediaByHashes(hashes);
  let quotaWarning:
    | {
        code: string;
        detail: string;
        hint?: string;
      }
    | undefined;

  const dedupLinks: {
    itemId: string;
    hash: string;
    audioAssetId: string;
    audioUrl: string;
    arweaveUrl?: string;
    arweaveUrls?: string[];
    storageRef?: string;
  }[] = [];
  let needsGeneration: { item: AudioItem; hash: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const hash = hashes[i];
    const existing = existingMedia.get(hash);
    if (existing) {
      dedupLinks.push({
        itemId: items[i].id,
        hash,
        audioAssetId: existing.id,
        audioUrl: getAudioUrl(hash),
        arweaveUrl:
          existing.storageType === "arweave"
            ? getArweaveGatewayUrls(existing.storageRef)[0]
            : undefined,
        arweaveUrls:
          existing.storageType === "arweave"
            ? getArweaveGatewayUrls(existing.storageRef)
            : undefined,
        storageRef: existing.storageRef,
      });
    } else {
      needsGeneration.push({ item: items[i], hash });
    }
  }

  if (dedupLinks.length > 0) {
    await batchLinkAudioToItems(
      dedupLinks.map((d) => ({
        itemId: d.itemId,
        audioAssetId: d.audioAssetId,
        audioStatus: "ready" as const,
        ...(audioField === "known" ? { audioField } : {}),
      })),
    );
  }

  let quotaLimit:
    | {
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
      }
    | undefined;

  if (provider === "google_tts" && needsGeneration.length > 0) {
    let quota: Awaited<ReturnType<typeof reserveGoogleApiUsage>> | undefined;
    const requestedUnits = countGoogleApiTextUnits(needsGeneration.map(({ item }) => item.text));
    try {
      quota = await reserveGoogleApiUsage({
        userId: user.id,
        scope: "tts",
        units: requestedUnits,
        requestCount: needsGeneration.length,
      });
    } catch (err) {
      const detail = getErrorDetail(err);
      console.error("[Wordlink audio] Google TTS quota check failed", {
        detail,
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
      });
      quotaWarning = {
        code: "GOOGLE_TTS_QUOTA_TRACKING_FAILED",
        detail,
        hint: detail.includes("google_api_usage")
          ? "The google_api_usage table or its constraints may be missing. Run the latest database migrations."
          : undefined,
      };
    }
    if (quota && !quota.allowed) {
      if (allowPartial) {
        const remainingUnits = Math.max(0, quota.accountLimit - quota.usedUnits);
        const allowedGeneration: typeof needsGeneration = [];
        let allowedUnits = 0;

        for (const candidate of needsGeneration) {
          const itemUnits = countGoogleApiTextUnits([candidate.item.text]);
          if (itemUnits === 0 || allowedUnits + itemUnits <= remainingUnits) {
            allowedGeneration.push(candidate);
            allowedUnits += itemUnits;
          }
        }

        if (allowedGeneration.length > 0) {
          const partialQuota = await reserveGoogleApiUsage({
            userId: user.id,
            scope: "tts",
            units: allowedUnits,
            requestCount: allowedGeneration.length,
          });

          if (partialQuota.allowed) {
            quotaLimit = {
              code: "GOOGLE_API_PARTIAL_LIMIT",
              message: PARTIAL_QUOTA_MESSAGE,
              requested_units: requestedUnits,
              allowed_units: allowedUnits,
              skipped_items: needsGeneration.length - allowedGeneration.length,
              usage: {
                used_units: quota.usedUnits,
                account_limit: quota.accountLimit,
                free_monthly_units: quota.freeMonthlyUnits,
                period_start: quota.periodStart.toISOString(),
              },
            };
            needsGeneration = allowedGeneration;
          } else {
            quota = partialQuota;
          }
        }
      }

      if (!quotaLimit) {
        const message = quota.message ?? PARTIAL_QUOTA_MESSAGE;
        const remainingUnits = Math.max(0, quota.accountLimit - quota.usedUnits);
        const status = allowPartial && remainingUnits > 0 ? 200 : 429;
        const skippedResults = items.map((item) => {
          const dedup = dedupLinks.find((d) => d.itemId === item.id);
          if (dedup) {
            return {
              id: item.id,
              content_hash: dedup.hash,
              audio_url: dedup.audioUrl,
              arweave_url: dedup.arweaveUrl,
              arweave_urls: dedup.arweaveUrls,
              storage_ref: dedup.storageRef,
              status: "ok" as const,
              source: "dedup" as const,
            };
          }
          return {
            id: item.id,
            audio_url: null,
            status: "error" as const,
            error: message,
            source: "generated" as const,
          };
        });

        if (status === 200) {
          return NextResponse.json({
            results: skippedResults,
            dedup_count: dedupLinks.length,
            generated_count: 0,
            quota_limit: {
              code: "GOOGLE_API_PARTIAL_LIMIT",
              message,
              requested_units: requestedUnits,
              allowed_units: 0,
              skipped_items: needsGeneration.length,
              usage: {
                used_units: quota.usedUnits,
                account_limit: quota.accountLimit,
                free_monthly_units: quota.freeMonthlyUnits,
                period_start: quota.periodStart.toISOString(),
              },
            },
          });
        }

        return NextResponse.json(
          {
            error: message,
            code: "GOOGLE_API_ACCOUNT_LIMIT_REACHED",
            scope: quota.scope,
            usage: {
              used_units: quota.usedUnits,
              requested_units: quota.requestedUnits,
              account_limit: quota.accountLimit,
              free_monthly_units: quota.freeMonthlyUnits,
              period_start: quota.periodStart.toISOString(),
            },
          },
          { status: 429 },
        );
      }
    }
  }

  const generatedResults: {
    itemId: string;
    hash: string;
    status: "ok" | "error";
    audioUrl?: string;
    arweaveUrl?: string;
    arweaveUrls?: string[];
    storageRef?: string;
    sizeBytes?: number;
    error?: string;
  }[] = [];

  let quotaExhaustedMessage: string | null = null;

  for (let i = 0; i < needsGeneration.length; i += CONCURRENCY) {
    if (quotaExhaustedMessage) break;

    const batch = needsGeneration.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ item, hash }) => {
        if (quotaExhaustedMessage) {
          await batchLinkAudioToItems([{
            itemId: item.id,
            audioAssetId: null,
            audioStatus: "failed",
            ...(audioField === "known" ? { audioField } : {}),
          }]);
          return { itemId: item.id, hash, status: "error" as const, error: quotaExhaustedMessage };
        }
        try {
          let result: { audio: Buffer; sizeBytes: number } | null = null;

          if (provider === "google_tts") {
            const googleVoiceId = voice_id?.trim();
            result = googleVoiceId
              ? await googleTTS(item.text, item.language, googleVoiceId)
              : await googleTTS(item.text, item.language);
          } else if (provider === "elevenlabs" && encryptedKey) {
            result = await elevenLabsTTS(
              item.text,
              item.language,
              encryptedKey,
              voice_id ?? "default",
            );
          }

          if (!result) {
            await batchLinkAudioToItems([
              {
                itemId: item.id,
                audioAssetId: null,
                audioStatus: "failed",
                ...(audioField === "known" ? { audioField } : {}),
              },
            ]);
            return {
              itemId: item.id,
              hash,
              status: "error" as const,
              error: "TTS provider returned no audio",
            };
          }

          const storage = await uploadAudio(result.audio, {
            contentHash: hash,
            language: item.language,
            textReference: item.text,
            provider,
            voiceId: voice_id ?? "default",
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

          const asset = force
            ? await upsertMediaAsset(mediaAssetData)
            : await createMediaAsset(mediaAssetData);

          await batchLinkAudioToItems([
            {
              itemId: item.id,
              audioAssetId: asset.id,
              audioStatus: "ready",
              ...(audioField === "known" ? { audioField } : {}),
            },
          ]);

          return {
            itemId: item.id,
            hash,
            status: "ok" as const,
            audioUrl: getAudioUrl(hash),
            arweaveUrl: storage.gatewayUrl,
            arweaveUrls: storage.gatewayUrls,
            storageRef: storage.storageRef,
            sizeBytes: result.sizeBytes,
          };
        } catch (err) {
          if (err instanceof GoogleTTSQuotaExhaustedError) {
            quotaExhaustedMessage = err.message;
          }
          const detail = getErrorDetail(err);
          console.error("[Wordlink audio] item generation failed", {
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
              ...(audioField === "known" ? { audioField } : {}),
            },
          ]);
          return {
            itemId: item.id,
            hash,
            status: "error" as const,
            error: detail,
          };
        }
      }),
    );
    generatedResults.push(...batchResults);
  }

  if (
    quotaExhaustedMessage
    && dedupLinks.length === 0
    && generatedResults.every((r) => r.status === "error")
  ) {
    return NextResponse.json(
      {
        error: quotaExhaustedMessage,
        code: "GOOGLE_TTS_QUOTA_EXHAUSTED",
      },
      { status: 429 },
    );
  }

  const results = items.map((item) => {
    const dedup = dedupLinks.find((d) => d.itemId === item.id);
    if (dedup) {
      return {
        id: item.id,
        content_hash: dedup.hash,
        audio_url: dedup.audioUrl,
        arweave_url: dedup.arweaveUrl,
        arweave_urls: dedup.arweaveUrls,
        storage_ref: dedup.storageRef,
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
        size_bytes: gen.sizeBytes,
        status: gen.status,
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

  return NextResponse.json({
    results,
    dedup_count: dedupLinks.length,
    generated_count: generatedResults.filter((r) => r.status === "ok").length,
    ...(quotaLimit ? { quota_limit: quotaLimit } : {}),
    ...(quotaWarning ? { quota_warning: quotaWarning } : {}),
  });
}
