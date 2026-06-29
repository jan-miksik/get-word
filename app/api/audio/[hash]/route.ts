import { NextRequest, NextResponse } from "next/server";
import { findMediaByHash } from "@/lib/db";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import { getAudio, isR2Configured, r2KeyForHash } from "@/lib/r2-storage";

type RouteContext = { params: Promise<{ hash: string }> };

const ARWEAVE_AUDIO_GATEWAY_TIMEOUT_MS = 3_500;

/**
 * GET /api/audio/[hash] — serve audio by content hash.
 * Looks up the asset in `media_assets` and streams from the recorded
 * storage backend; Arweave-backed assets fall through gateway candidates.
 */
function noStoreJson(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function audioResponse(
  audio: { body: ArrayBuffer; contentType: string },
  storageHeader: string,
) {
  return new NextResponse(audio.body, {
    status: 200,
    headers: {
      "Content-Type": audio.contentType || "audio/mpeg",
      "Content-Length": String(audio.body.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Audio-Storage": storageHeader,
    },
  });
}

function shouldLogR2Serve(request: NextRequest) {
  return process.env.NODE_ENV !== "production" || request.nextUrl.searchParams.get("debug") === "1";
}

function logR2Serve(request: NextRequest, contentHash: string, path: "r2-fallback" | "r2-row") {
  if (!shouldLogR2Serve(request)) return;
  console.info("[Get Word audio] served audio from R2", {
    contentHash,
    path,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { hash } = await context.params;

  const asset = await findMediaByHash(hash);
  if (!asset) {
    return noStoreJson({ error: "Audio not found" }, 404);
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
        const signal = AbortSignal.timeout(ARWEAVE_AUDIO_GATEWAY_TIMEOUT_MS);
        const response = await fetch(gatewayUrl, {
          headers: {
            Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
          },
          cache: "force-cache",
          signal,
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

    const r2Audio = await getAudio(asset.contentHash);
    if (r2Audio) {
      logR2Serve(request, asset.contentHash, "r2-fallback");
      return audioResponse(r2Audio, "r2-fallback");
    }

    console.warn("[Get Word audio] all Arweave audio gateways failed", {
      contentHash: asset.contentHash,
      storageRef: asset.storageRef,
      attempts,
      r2Fallback: "miss",
    });

    return noStoreJson(
      {
        error: "Audio file could not be loaded from any Arweave gateway",
        content_hash: asset.contentHash,
        storage_ref: asset.storageRef,
        attempts,
      },
      502,
    );
  }

  if (asset.storageType === "r2" && !/^https?:\/\//.test(asset.storageRef)) {
    const expectedKey = r2KeyForHash(asset.contentHash);
    if (asset.storageRef !== expectedKey) {
      console.warn("[Get Word audio] R2 storageRef mismatch; serving by content hash", {
        contentHash: asset.contentHash,
        storageRef: asset.storageRef,
        expectedKey,
      });
    }

    if (!isR2Configured()) {
      if (process.env.NODE_ENV === "production") {
        return noStoreJson({ error: "R2 storage not configured" }, 503);
      }
    } else {
      const r2Audio = await getAudio(asset.contentHash);
      if (r2Audio) {
        logR2Serve(request, asset.contentHash, "r2-row");
        return audioResponse(r2Audio, "r2");
      }

      return noStoreJson({ error: "Audio not found in R2" }, 404);
    }
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
