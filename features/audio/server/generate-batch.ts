import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import {
  countGoogleApiTextUnits,
  findMediaByHashes,
  batchLinkAudioToItems,
  reserveGoogleApiUsage,
} from "@/lib/db";
import {
  computeContentHash,
  getAudioUrl,
} from "@/lib/audio";
import { isPlayableAudioAsset } from "@/lib/audio-assets";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import { isObjectStorageConfigured } from "@/lib/object-storage";
import { getUserApiKey } from "@/lib/translation";
import { getErrorDetail } from "./batch/errors";
import { generateAudioForItem } from "./batch/generate-item";
import { buildBatchResults } from "./batch/results";
import {
  AUDIO_FORMAT,
  CONCURRENCY,
  INLINE_TOTAL_MAX_BYTES,
  MAX_ITEMS,
  PARTIAL_QUOTA_MESSAGE,
  type AudioItem,
  type DedupLink,
  type GeneratedResult,
  type GenerationCandidate,
  type QuotaLimit,
} from "./batch/types";

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

  const resolveItemVoice = (item: AudioItem) => item.voice_id ?? voice_id;
  const hashes = items.map((item) =>
    computeContentHash(item.text, item.language, provider, {
      voiceId: resolveItemVoice(item) ?? "default",
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

  const dedupLinks: DedupLink[] = [];
  let needsGeneration: GenerationCandidate[] = [];

  for (let i = 0; i < items.length; i++) {
    const hash = hashes[i];
    const existing = existingMedia.get(hash);
    if (isPlayableAudioAsset(existing)) {
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
        voiceId: resolveItemVoice(items[i]) ?? "default",
      });
    } else {
      needsGeneration.push({
        item: items[i],
        hash,
        replaceExisting: Boolean(existing),
        voiceId: resolveItemVoice(items[i]),
      });
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

  let quotaLimit: QuotaLimit | undefined;

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
      console.error("[Get Word audio] Google TTS quota check failed", {
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
              voice_id: dedup.voiceId ?? null,
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

  const generatedResults: GeneratedResult[] = [];
  let quotaExhaustedMessage: string | null = null;

  // One-shot heads-up per batch: without a configured object store the Arweave
  // upload has no mirror, so generated audio cannot fall back if gateways fail.
  if (needsGeneration.length > 0 && !isObjectStorageConfigured()) {
    console.warn(
      "[Get Word audio] object storage mirror is not configured — generating " +
        `${needsGeneration.length} item(s) as Arweave-only with no fallback. ` +
        "Set AUDIO_OBJECT_STORE_* (provider, endpoint, region, keys, bucket) to enable the mirror.",
    );
  }

  for (let i = 0; i < needsGeneration.length; i += CONCURRENCY) {
    if (quotaExhaustedMessage) break;

    const batch = needsGeneration.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (candidate) => {
        if (quotaExhaustedMessage) {
          await batchLinkAudioToItems([{
            itemId: candidate.item.id,
            audioAssetId: null,
            audioStatus: "failed",
            ...(audioField === "known" ? { audioField } : {}),
          }]);
          return {
            itemId: candidate.item.id,
            hash: candidate.hash,
            status: "error" as const,
            error: quotaExhaustedMessage,
          };
        }
        const { result, quotaExhausted } = await generateAudioForItem(candidate, {
          provider,
          voiceId: voice_id,
          encryptedKey,
          audioField,
          force,
        });
        if (quotaExhausted) {
          quotaExhaustedMessage = quotaExhausted;
        }
        return result;
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

  // Enforce the whole-response inline-bytes budget: keep inlined audio in order
  // until the budget is spent, then strip the rest (the client falls back to
  // fetching those through the audio proxy). Per-clip cap already applied upstream.
  let inlineBudget = INLINE_TOTAL_MAX_BYTES;
  for (const gen of generatedResults) {
    if (!gen.audioBase64) continue;
    if (gen.sizeBytes && gen.sizeBytes <= inlineBudget) {
      inlineBudget -= gen.sizeBytes;
    } else {
      delete gen.audioBase64;
    }
  }

  const results = buildBatchResults(items, dedupLinks, generatedResults, quotaLimit);

  return NextResponse.json({
    results,
    dedup_count: dedupLinks.length,
    generated_count: generatedResults.filter((r) => r.status === "ok").length,
    ...(quotaLimit ? { quota_limit: quotaLimit } : {}),
    ...(quotaWarning ? { quota_warning: quotaWarning } : {}),
  });
}
