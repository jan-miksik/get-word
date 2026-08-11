import { findMediaByHash } from "@/lib/db";
import { getArweaveGatewayUrls } from "@/lib/audio-storage";
import {
  getActiveObjectStorageProvider,
  getAudio,
  isObjectStorageConfigured,
} from "@/lib/object-storage";

const ARWEAVE_AUDIO_GATEWAY_TIMEOUT_MS = 3_500;
/**
 * These URLs are content-addressed, so a body can never change under a hash and
 * every layer may keep it forever.
 *
 * `s-maxage` is the part that matters for cost: without it Vercel's edge treats
 * a function response as private and every device's first play of a clip walks
 * all the way through to the object store. `max-age` alone only ever reached the
 * browser. One edge copy per region now serves the rest.
 */
const HASHED_AUDIO_CACHE_CONTROL =
  "public, max-age=31536000, s-maxage=31536000, immutable";

export type AudioServeResult =
  | { kind: "json"; body: object; status: number; cacheControl: string }
  | {
      kind: "audio";
      body: ArrayBuffer;
      contentType: string;
      headers: Record<string, string>;
    }
  | { kind: "redirect"; url: string; cacheControl: string };

/**
 * GET /api/audio/[hash] — serve audio by content hash.
 * Looks up the asset in `media_assets` and streams from the recorded
 * storage backend; Arweave-backed assets fall through gateway candidates.
 */
function noStoreJson(body: object, status: number) {
  return { kind: "json", body, status, cacheControl: "no-store" } as const;
}

function audioResponse(
  audio: { body: ArrayBuffer; contentType: string },
  storageHeader: string,
  provider: string,
) {
  return {
    kind: "audio",
    body: audio.body,
    contentType: audio.contentType || "audio/mpeg",
    headers: {
      "Content-Type": audio.contentType || "audio/mpeg",
      "Content-Length": String(audio.body.byteLength),
      "Cache-Control": HASHED_AUDIO_CACHE_CONTROL,
      "X-Audio-Storage": storageHeader,
      "X-Audio-Storage-Provider": provider,
    },
  } as const;
}

function shouldLogObjectServe(debug: boolean) {
  return process.env.NODE_ENV !== "production" || debug;
}

function logObjectServe(
  debug: boolean,
  contentHash: string,
  path: "object-fallback" | "object-row",
  provider: string,
) {
  if (!shouldLogObjectServe(debug)) return;
  console.info("[Get Word audio] served audio from object storage", {
    contentHash,
    path,
    provider,
  });
}

/**
 * HEAD /api/audio/[hash] — does this clip exist?
 *
 * Answered from `media_assets` alone. Without its own handler a HEAD is served
 * by running the GET, which downloads the whole clip from the object store just
 * to throw the bytes away — and the client probes availability per word before
 * a minigame, so a single round of them cost one object-store read each. The
 * row is the right answer for the question actually being asked ("is there
 * audio for this word"); playback still walks the full gateway and mirror
 * fallbacks, so a row whose bytes turn out to be unreachable is caught there.
 */
export async function headAudioByHash(hash: string): Promise<{
  status: number;
  headers: Record<string, string>;
}> {
  const asset = await findMediaByHash(hash);
  if (!asset) {
    return { status: 404, headers: { "Cache-Control": "no-store" } };
  }
  return {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": HASHED_AUDIO_CACHE_CONTROL,
      "X-Audio-Storage": "metadata",
    },
  };
}

export async function serveAudioByHash(hash: string, debug = false): Promise<AudioServeResult> {
  const asset = await findMediaByHash(hash);
  if (!asset) {
    return noStoreJson({ error: "Audio not found" }, 404);
  }

  if (asset.storageType === "arweave") {
    // Arweave is the canonical durable source. Only hit the B2 mirror after all
    // configured gateways fail, so normal playback does not spend B2 Class B ops.
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

        return {
          kind: "audio",
          body: audio,
          contentType: contentType || "audio/mpeg",
          headers: {
            "Content-Type": contentType || "audio/mpeg",
            "Content-Length": String(audio.byteLength),
            "Cache-Control": HASHED_AUDIO_CACHE_CONTROL,
            "X-Audio-Gateway": gatewayUrl,
            "X-Audio-Storage-Ref": asset.storageRef,
          },
        };
      } catch (err) {
        attempts.push({
          url: gatewayUrl,
          error: err instanceof Error ? err.message : "Unknown gateway error",
        });
      }
    }

    const activeProvider = getActiveObjectStorageProvider();
    const mirroredAudio = await getAudio(asset.contentHash, activeProvider);
    if (mirroredAudio) {
      logObjectServe(debug, asset.contentHash, "object-fallback", activeProvider);
      return audioResponse(mirroredAudio, "object-fallback", activeProvider);
    }

    console.warn("[Get Word audio] all Arweave audio gateways failed", {
      contentHash: asset.contentHash,
      storageRef: asset.storageRef,
      attempts,
      objectFallback: "miss-after-gateway-fallback",
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
        logObjectServe(debug, asset.contentHash, "object-row", provider);
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
    return {
      kind: "redirect",
      url: asset.storageRef,
      cacheControl: HASHED_AUDIO_CACHE_CONTROL,
    };
  }

  // Legacy/local-dev fallback: return metadata only when no real remote object exists.
  return {
    kind: "json",
    body: {
      content_hash: asset.contentHash,
      storage_type: asset.storageType,
      storage_ref: asset.storageRef,
      language: asset.language,
      text_reference: asset.textReference,
      provider: asset.provider,
    },
    status: 200,
    cacheControl: "public, max-age=86400",
  };
}
