import { NextRequest, NextResponse } from "next/server";
import { findMediaByHash } from "@/lib/db";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";

type RouteContext = { params: Promise<{ hash: string }> };

/**
 * GET /api/audio/[hash] — serve audio by content hash.
 * Fallback endpoint when no Cloudflare Worker is configured.
 * In production, the Worker handles this with R2 cache + Arweave fallback.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { hash } = await context.params;

  const asset = await findMediaByHash(hash);
  if (!asset) {
    return NextResponse.json({ error: "Audio not found" }, { status: 404 });
  }

  if (asset.storageType === "arweave") {
    const gatewayUrls = getArweaveGatewayUrls(asset.storageRef);
    const attempts: {
      url: string;
      status?: number;
      contentType?: string;
      error?: string;
    }[] = [];

    for (const gatewayUrl of gatewayUrls) {
      try {
        const response = await fetch(gatewayUrl, {
          headers: {
            Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
          },
          cache: "force-cache",
        });
        const contentType = response.headers.get("content-type") ?? "";
        attempts.push({
          url: gatewayUrl,
          status: response.status,
          contentType,
        });

        const normalizedContentType = contentType.toLowerCase();
        const looksLikeAudio =
          normalizedContentType.startsWith("audio/") ||
          normalizedContentType.includes("mpeg") ||
          normalizedContentType.includes("octet-stream") ||
          normalizedContentType === "";

        if (!response.ok || !looksLikeAudio) continue;

        const audio = await response.arrayBuffer();
        if (audio.byteLength === 0) continue;

        return new NextResponse(audio, {
          status: 200,
          headers: {
            "Content-Type": contentType || "audio/mpeg",
            "Content-Length": String(audio.byteLength),
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Audio-Gateway": gatewayUrl,
            "X-Audio-Storage-Ref": asset.storageRef,
          },
        });
      } catch (err) {
        attempts.push({
          url: gatewayUrl,
          error: err instanceof Error ? err.message : "Unknown gateway error",
        });
      }
    }

    console.warn("[Wordlink audio] all Arweave audio gateways failed", {
      contentHash: asset.contentHash,
      storageRef: asset.storageRef,
      attempts,
    });

    return NextResponse.json(
      {
        error: "Audio file could not be loaded from any Arweave gateway",
        content_hash: asset.contentHash,
        storage_ref: asset.storageRef,
        attempts,
      },
      { status: 502 },
    );
  }

  if (/^https?:\/\//.test(asset.storageRef)) {
    return NextResponse.redirect(asset.storageRef, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  // Legacy/local-dev fallback: return metadata only when no real remote object exists.
  return NextResponse.json(
    {
      content_hash: asset.contentHash,
      storage_type: asset.storageType,
      storage_ref: asset.storageRef,
      language: asset.language,
      text_reference: asset.textReference,
      provider: asset.provider,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
