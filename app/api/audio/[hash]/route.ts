import { NextRequest, NextResponse } from "next/server";
import { findMediaByHash } from "@/lib/db";

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

  // If storage is via Worker (arweave or r2), redirect to Worker URL
  const workerUrl = process.env.MEDIA_PROXY_WORKER_URL;
  if (workerUrl) {
    return NextResponse.redirect(`${workerUrl}/audio/${hash}`, {
      status: 302,
      headers: {
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  // Local dev fallback: return metadata only (no actual audio bytes stored locally)
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
