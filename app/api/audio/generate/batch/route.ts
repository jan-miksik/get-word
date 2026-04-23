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

export const runtime = "nodejs";

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

async function handlePost(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { items, provider, voice_id } = body as {
    items?: AudioItem[];
    provider?: string;
    voice_id?: string;
    force?: boolean;
  };
  const force = body.force === true;

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

  // For ElevenLabs, require BYOK key
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

  // Step 1: DB dedup — check for existing media assets by content hash
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

  // Split into dedup-resolved and needs-generation
  const dedupLinks: {
    itemId: string;
    hash: string;
    audioAssetId: string;
    audioUrl: string;
    arweaveUrl?: string;
    arweaveUrls?: string[];
    storageRef?: string;
  }[] = [];
  const needsGeneration: { item: AudioItem; hash: string }[] = [];

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

  if (provider === "google_tts" && needsGeneration.length > 0) {
    let quota: Awaited<ReturnType<typeof reserveGoogleApiUsage>> | undefined;
    try {
      quota = await reserveGoogleApiUsage({
        userId: user.id,
        scope: "tts",
        units: countGoogleApiTextUnits(needsGeneration.map(({ item }) => item.text)),
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
      return NextResponse.json(
        {
          error: quota.message,
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

  // Link dedup-resolved items immediately
  if (dedupLinks.length > 0) {
    await batchLinkAudioToItems(
      dedupLinks.map((d) => ({
        itemId: d.itemId,
        audioAssetId: d.audioAssetId,
        audioStatus: "ready" as const,
      })),
    );
  }

  // Step 2: Generate audio for remaining items in parallel batches
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

  for (let i = 0; i < needsGeneration.length; i += CONCURRENCY) {
    const batch = needsGeneration.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async ({ item, hash }) => {
        try {
          // Generate audio
          let result: { audio: Buffer; sizeBytes: number } | null = null;

          if (provider === "google_tts") {
            result = await googleTTS(item.text, item.language);
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
              { itemId: item.id, audioAssetId: null, audioStatus: "failed" },
            ]);
            return { itemId: item.id, hash, status: "error" as const, error: "Generation failed" };
          }

          // Upload to Arweave via ArDrive Turbo
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

          // Create media asset record. Regeneration replaces stale/broken refs for the same hash.
          const asset = force
            ? await upsertMediaAsset(mediaAssetData)
            : await createMediaAsset(mediaAssetData);

          // Link to word_list_item
          await batchLinkAudioToItems([
            { itemId: item.id, audioAssetId: asset.id, audioStatus: "ready" },
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
          await batchLinkAudioToItems([
            { itemId: item.id, audioAssetId: null, audioStatus: "failed" },
          ]);
          return {
            itemId: item.id,
            hash,
            status: "error" as const,
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      }),
    );
    generatedResults.push(...batchResults);
  }

  // Build unified results
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
      error: "Not processed",
      source: "generated" as const,
    };
  });

  return NextResponse.json({
    results,
    dedup_count: dedupLinks.length,
    generated_count: generatedResults.filter((r) => r.status === "ok").length,
    ...(quotaWarning ? { quota_warning: quotaWarning } : {}),
  });
}

export async function POST(request: NextRequest) {
  const requestId =
    globalThis.crypto?.randomUUID?.() ??
    `audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    return await handlePost(request);
  } catch (err) {
    console.error("[Wordlink audio] batch generation crashed", {
      requestId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "Audio generation crashed before it could finish.",
        request_id: requestId,
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
