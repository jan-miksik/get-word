import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import {
  findMediaByHashes,
  createMediaAsset,
  batchLinkAudioToItems,
} from "@/lib/db";
import {
  computeContentHash,
  googleTTS,
  elevenLabsTTS,
  getAudioUrl,
} from "@/lib/audio";
import { uploadAudio } from "@/lib/audio-storage";
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

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { items, provider, voice_id } = body as {
    items?: AudioItem[];
    provider?: string;
    voice_id?: string;
  };

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
  const existingMedia = await findMediaByHashes(hashes);

  // Split into dedup-resolved and needs-generation
  const dedupLinks: { itemId: string; audioAssetId: string; audioUrl: string }[] = [];
  const needsGeneration: { item: AudioItem; hash: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const hash = hashes[i];
    const existing = existingMedia.get(hash);
    if (existing) {
      dedupLinks.push({
        itemId: items[i].id,
        audioAssetId: existing.id,
        audioUrl: getAudioUrl(hash),
      });
    } else {
      needsGeneration.push({ item: items[i], hash });
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

          // Create media asset record
          const asset = await createMediaAsset({
            contentHash: hash,
            storageType: storage.storageType,
            storageRef: storage.storageRef,
            mediaType: "audio",
            language: item.language,
            textReference: item.text,
            provider: provider as "google_tts" | "elevenlabs",
            sizeBytes: result.sizeBytes,
          });

          // Link to word_list_item
          await batchLinkAudioToItems([
            { itemId: item.id, audioAssetId: asset.id, audioStatus: "ready" },
          ]);

          return {
            itemId: item.id,
            hash,
            status: "ok" as const,
            audioUrl: getAudioUrl(hash),
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
        audio_url: dedup.audioUrl,
        status: "ok" as const,
        source: "dedup" as const,
      };
    }
    const gen = generatedResults.find((g) => g.itemId === item.id);
    if (gen) {
      return {
        id: item.id,
        audio_url: gen.audioUrl ?? null,
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
  });
}
