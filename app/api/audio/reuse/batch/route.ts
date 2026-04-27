import { NextRequest, NextResponse } from "next/server";
import {
  batchLinkAudioToItems,
  findMediaByHashes,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
} from "@/lib/auth";
import { computeContentHash, getAudioUrl } from "@/lib/audio";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";

type AudioReuseItem = {
  id: string;
  text: string;
  language: string;
};

const MAX_ITEMS = 200;
const AUDIO_FORMAT = "mp3";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json();
  const { items, provider, voice_id } = body as {
    items?: AudioReuseItem[];
    provider?: string;
    voice_id?: string;
    link?: boolean;
    audio_field?: "known" | "target";
  };
  const shouldLink = body.link === true;
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

  const hashes = items.map((item) =>
    computeContentHash(item.text, item.language, provider, {
      voiceId: voice_id ?? "default",
      audioFormat: AUDIO_FORMAT,
    }),
  );
  const existingMedia = await findMediaByHashes(hashes);

  const linkUpdates: {
    itemId: string;
    audioAssetId: string | null;
    audioStatus: "ready";
  }[] = [];

  const results = items.map((item, index) => {
    const hash = hashes[index];
    const asset = existingMedia.get(hash);
    if (!asset) {
      return {
        id: item.id,
        content_hash: hash,
        status: "missing" as const,
        audio_url: null,
      };
    }

    if (shouldLink) {
      linkUpdates.push({
        itemId: item.id,
        audioAssetId: asset.id,
        audioStatus: "ready",
        ...(audioField === "known" ? { audioField } : {}),
      });
    }

    const arweaveUrls =
      asset.storageType === "arweave"
        ? getArweaveGatewayUrls(asset.storageRef)
        : [];

    return {
      id: item.id,
      content_hash: hash,
      status: "found" as const,
      audio_url: getAudioUrl(hash),
      arweave_url: arweaveUrls[0] ?? null,
      arweave_urls: arweaveUrls,
      storage_ref: asset.storageRef,
      provider: asset.provider,
      size_bytes: asset.sizeBytes,
      linked: shouldLink,
    };
  });

  if (linkUpdates.length > 0) {
    await batchLinkAudioToItems(linkUpdates);
  }

  return NextResponse.json({
    results,
    found_count: results.filter((result) => result.status === "found").length,
    linked_count: linkUpdates.length,
  });
}
