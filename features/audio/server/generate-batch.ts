import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  countGoogleApiTextUnits,
  findMediaByHashes,
  batchLinkAudioToItems,
  recordGoogleApiUsage,
  reserveGoogleApiUsage,
} from "@/lib/db";
import {
  DEFAULT_GOOGLE_TTS_VOICE_ID,
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
import { findUnauthorizedAudioItemIds } from "./list-authz";
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

  // Audio generation mutates the media asset linked to each item id, so the caller
  // must be allowed to edit every item's list — a bare item id (e.g. from a
  // subscriber, or a probe against a curated list) must never grant a write. This
  // mirrors the scan/repair route authz: owner, or editor for curated/recommended.
  const unauthorized = await findUnauthorizedAudioItemIds(
    items.map((item) => item.id),
    user,
  );
  if (unauthorized.length > 0) {
    return forbiddenResponse("Not authorized to generate audio for one or more items");
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

  const normalizeRequestedVoice = (value: string | undefined) =>
    value && value !== "default" && value !== DEFAULT_GOOGLE_TTS_VOICE_ID ? value : undefined;
  const resolveItemVoice = (item: AudioItem) => normalizeRequestedVoice(item.voice_id ?? voice_id);
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
        createdAt: existing.createdAt ? new Date(existing.createdAt).toISOString() : null,
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
              created_at: dedup.createdAt ?? null,
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
          googleUsageSource: "audio_batch",
          googleUsageUserId: user.id,
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

  // True up quota: the reservation above counted one Google call per item, but the
  // quality autofix can fire extra fallback calls on suspect clips. Record the surplus
  // best-effort — the calls already happened, so account for them even if the total
  // has crossed the monthly cap (the next reservation will then correctly refuse).
  if (provider === "google_tts") {
    const extraUnits = generatedResults.reduce((sum, r) => sum + (r.extraGoogleUnits ?? 0), 0);
    const extraRequests = generatedResults.reduce((sum, r) => sum + (r.extraGoogleRequests ?? 0), 0);
    if (extraUnits > 0 || extraRequests > 0) {
      try {
        await recordGoogleApiUsage({
          userId: user.id,
          scope: "tts",
          units: extraUnits,
          requestCount: extraRequests,
        });
      } catch (err) {
        console.error("[Get Word audio] failed to record autofix retry usage", {
          extraUnits,
          extraRequests,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
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

  // Non-fatal heads-up: some clips are durable on Arweave but their B2 mirror upload
  // failed. Report how many and the categories so the failure is visible (the mirror
  // silently returned false before) without failing the request.
  const mirrorFailures = generatedResults.filter((r) => r.mirrorFailedCategory);
  const objectMirrorWarning =
    mirrorFailures.length > 0
      ? {
          code: "OBJECT_MIRROR_UPLOAD_FAILED",
          detail:
            `${mirrorFailures.length} clip(s) saved to Arweave only — the B2 mirror upload failed ` +
            `(${Array.from(new Set(mirrorFailures.map((r) => r.mirrorFailedCategory))).join(", ")}). ` +
            `Playback still works via Arweave; check AUDIO_OBJECT_STORE_* and server logs.`,
          failed_count: mirrorFailures.length,
          categories: Array.from(new Set(mirrorFailures.map((r) => r.mirrorFailedCategory))),
        }
      : undefined;

  if (objectMirrorWarning) {
    console.warn("[Get Word audio] object mirror upload failed for some clips", objectMirrorWarning);
  }

  const results = buildBatchResults(items, dedupLinks, generatedResults, quotaLimit);

  return NextResponse.json({
    results,
    dedup_count: dedupLinks.length,
    generated_count: generatedResults.filter((r) => r.status === "ok").length,
    ...(quotaLimit ? { quota_limit: quotaLimit } : {}),
    ...(quotaWarning ? { quota_warning: quotaWarning } : {}),
    ...(objectMirrorWarning ? { object_mirror_warning: objectMirrorWarning } : {}),
  });
}
