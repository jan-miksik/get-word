import { NextRequest, NextResponse } from "next/server";
import { findMediaByHash } from "@/lib/db";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import {
  getActiveObjectStorageProvider,
  getAudio,
  isObjectStorageConfigured,
} from "@/lib/object-storage";

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
  provider: string,
) {
  return new NextResponse(audio.body, {
    status: 200,
    headers: {
      "Content-Type": audio.contentType || "audio/mpeg",
      "Content-Length": String(audio.body.byteLength),
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Audio-Storage": storageHeader,
      "X-Audio-Storage-Provider": provider,
    },
  });
}

function shouldLogObjectServe(request: NextRequest) {
  return process.env.NODE_ENV !== "production" || request.nextUrl.searchParams.get("debug") === "1";
}

function logObjectServe(
  request: NextRequest,
  contentHash: string,
  path: "object-fallback" | "object-row",
  provider: string,
) {
  if (!shouldLogObjectServe(request)) return;
  console.info("[Get Word audio] served audio from object storage", {
    contentHash,
    path,
    provider,
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

    const activeProvider = getActiveObjectStorageProvider();
    const fallbackAudio = await getAudio(asset.contentHash, activeProvider);
    if (fallbackAudio) {
      logObjectServe(request, asset.contentHash, "object-fallback", activeProvider);
      return audioResponse(fallbackAudio, "object-fallback", activeProvider);
    }

    console.warn("[Get Word audio] all Arweave audio gateways failed", {
      contentHash: asset.contentHash,
      storageRef: asset.storageRef,
      attempts,
      objectFallback: "miss",
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

  if (asset.storageType === "object_store" && !/^https?:\/\//.test(asset.storageRef)) {
    const provider = asset.storageProvider;
    if (!provider) {
      // Data-integrity guard: object_store rows must record their provider.
      console.error("[Get Word audio] object_store asset missing storage_provider", {
        contentHash: asset.contentHash,
        storageRef: asset.storageRef,
      });
      return noStoreJson({ error: "Audio storage provider unresolved" }, 500);
    }

    if (!isObjectStorageConfigured(provider)) {
      if (process.env.NODE_ENV === "production") {
        return noStoreJson({ error: "Object storage not configured" }, 503);
      }
    } else {
      const audio = await getAudio(asset.contentHash, provider);
      if (audio) {
        logObjectServe(request, asset.contentHash, "object-row", provider);
        return audioResponse(audio, "object", provider);
      }

      return noStoreJson({ error: "Audio not found in object storage" }, 404);
    }
  }

  // Legacy Cloudflare R2 rows: R2 has been removed, so these are no longer served.
  if (asset.storageType === "r2" && !/^https?:\/\//.test(asset.storageRef)) {
    return noStoreJson(
      { error: "R2 storage removed", content_hash: asset.contentHash },
      404,
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
