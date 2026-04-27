import { NextRequest, NextResponse } from "next/server";
import {
  batchLinkAudioToItems,
  findMediaByHashes,
  findMediaVariantsByText,
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
  selected_asset_id?: string;
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
  const [existingMedia, reusableVariants] = await Promise.all([
    findMediaByHashes(hashes),
    findMediaVariantsByText(items.map((item) => ({
      text: item.text,
      language: item.language,
    }))),
  ]);

  const linkUpdates: {
    itemId: string;
    audioAssetId: string | null;
    audioStatus: "ready";
  }[] = [];

  const results = items.map((item, index) => {
    const hash = hashes[index];
    const exactAsset = existingMedia.get(hash);
    const variants =
      reusableVariants.get(`${item.language}\u0000${item.text}`) ?? [];
    const selectedAsset =
      variants.find((asset) => asset.id === item.selected_asset_id)
      ?? exactAsset
      ?? variants[0];

    if (!selectedAsset) {
      return {
        id: item.id,
        content_hash: hash,
        status: "missing" as const,
        audio_url: null,
        matches: [],
      };
    }

    if (shouldLink) {
      linkUpdates.push({
        itemId: item.id,
        audioAssetId: selectedAsset.id,
        audioStatus: "ready",
        ...(audioField === "known" ? { audioField } : {}),
      });
    }

    const rawVariants = variants.some((asset) => asset.id === selectedAsset.id)
      ? variants
      : [selectedAsset, ...variants];

    const matches = rawVariants.map((asset) => {
      const arweaveUrls =
        asset.storageType === "arweave"
          ? getArweaveGatewayUrls(asset.storageRef)
          : [];

      return {
        asset_id: asset.id,
        content_hash: asset.contentHash,
        audio_url: getAudioUrl(asset.contentHash),
        arweave_url: arweaveUrls[0] ?? null,
        arweave_urls: arweaveUrls,
        storage_ref: asset.storageRef,
        provider: asset.provider,
        size_bytes: asset.sizeBytes,
      };
    });

    const selectedMatch =
      matches.find((match) => match.asset_id === selectedAsset.id)
      ?? matches[0];

    return {
      id: item.id,
      content_hash: selectedAsset.contentHash,
      status: "found" as const,
      audio_url: selectedMatch?.audio_url ?? null,
      arweave_url: selectedMatch?.arweave_url ?? null,
      arweave_urls: selectedMatch?.arweave_urls ?? [],
      storage_ref: selectedMatch?.storage_ref ?? null,
      provider: selectedMatch?.provider ?? null,
      size_bytes: selectedMatch?.size_bytes,
      asset_id: selectedAsset.id,
      selected_asset_id: selectedAsset.id,
      matches,
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
