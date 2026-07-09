import { AwsClient } from "aws4fetch";

export const OBJECT_AUDIO_CONTENT_TYPE = "audio/mpeg";
export const OBJECT_AUDIO_KEY_PREFIX = "audio";
export const OBJECT_AUDIO_EXTENSION = "mp3";
export const OBJECT_PUT_TIMEOUT_MS = 10_000;
export const OBJECT_GET_TIMEOUT_MS = 5_000;
export const OBJECT_HEAD_TIMEOUT_MS = 5_000;
export const OBJECT_DEFAULT_MAX_AUDIO_BYTES = 1_000_000;

/**
 * Supported object-storage providers. Backblaze B2 is the only active provider
 * today; the column + adapter are generic so adding another provider later means
 * an env, an adapter config branch, and a small enum migration — no read-model or
 * table-structure change. Cloudflare R2 has been removed.
 */
export type ObjectStorageProvider = "b2";

const SUPPORTED_PROVIDERS: readonly ObjectStorageProvider[] = ["b2"];
const DEFAULT_PROVIDER: ObjectStorageProvider = "b2";

type ObjectStorageConfig = {
  provider: ObjectStorageProvider;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const clientCache = new Map<ObjectStorageProvider, AwsClient>();

export function objectKeyForHash(contentHash: string): string {
  return `${OBJECT_AUDIO_KEY_PREFIX}/${encodeURIComponent(contentHash)}.${OBJECT_AUDIO_EXTENSION}`;
}

function isSupportedProvider(value: string): value is ObjectStorageProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolves the active object-storage provider from `AUDIO_OBJECT_STORE_PROVIDER`.
 * Production requires the env to be set explicitly so a misconfigured deploy is
 * visible; development and test default to B2 for convenience.
 */
export function getActiveObjectStorageProvider(): ObjectStorageProvider {
  const raw = process.env.AUDIO_OBJECT_STORE_PROVIDER?.trim();

  if (raw) {
    if (isSupportedProvider(raw)) return raw;
    console.warn("[Get Word audio] unknown AUDIO_OBJECT_STORE_PROVIDER; falling back", {
      provider: raw,
      fallback: DEFAULT_PROVIDER,
    });
    return DEFAULT_PROVIDER;
  }

  if (process.env.NODE_ENV === "production") {
    console.error("[Get Word audio] AUDIO_OBJECT_STORE_PROVIDER is not set in production");
  }
  return DEFAULT_PROVIDER;
}

function getObjectStorageConfig(
  provider: ObjectStorageProvider = getActiveObjectStorageProvider(),
): ObjectStorageConfig | null {
  // Only the active provider is configured at a time. Reading a row whose
  // provider differs from the configured one cannot be served.
  if (provider !== getActiveObjectStorageProvider()) {
    return null;
  }

  const accessKeyId = process.env.AUDIO_OBJECT_STORE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AUDIO_OBJECT_STORE_SECRET_ACCESS_KEY;
  const bucket = process.env.AUDIO_OBJECT_STORE_BUCKET;
  const endpoint = process.env.AUDIO_OBJECT_STORE_ENDPOINT;
  const region = process.env.AUDIO_OBJECT_STORE_REGION;

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint || !region) {
    return null;
  }

  return {
    provider,
    endpoint: endpoint.replace(/\/+$/, ""),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

function getObjectClient(config: ObjectStorageConfig): AwsClient {
  const cached = clientCache.get(config.provider);
  if (cached) return cached;

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    service: "s3",
    retries: 0,
  });
  clientCache.set(config.provider, client);
  return client;
}

function getObjectUrl(config: ObjectStorageConfig, contentHash: string): string {
  return `${config.endpoint}/${config.bucket}/${objectKeyForHash(contentHash)}`;
}

function getBucketUrl(config: ObjectStorageConfig, params: URLSearchParams): string {
  return `${config.endpoint}/${config.bucket}?${params.toString()}`;
}

function toArrayBufferBody(audio: Buffer | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (audio instanceof ArrayBuffer) return audio;
  const body = new Uint8Array(audio.byteLength);
  body.set(audio);
  return body.buffer;
}

function getAudioByteLength(audio: Buffer | ArrayBuffer | Uint8Array): number {
  return audio.byteLength;
}

function getMaxAudioBytes(): number {
  const raw = process.env.AUDIO_OBJECT_STORE_MAX_OBJECT_BYTES;
  if (!raw) return OBJECT_DEFAULT_MAX_AUDIO_BYTES;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : OBJECT_DEFAULT_MAX_AUDIO_BYTES;
}

export function isObjectStorageConfigured(
  provider: ObjectStorageProvider = getActiveObjectStorageProvider(),
): boolean {
  return getObjectStorageConfig(provider) !== null;
}

function logObjectFailure(
  operation: "put" | "get" | "head" | "list",
  contentHash: string,
  category: string,
  detail?: unknown,
) {
  console.warn("[Get Word audio] object storage failure", {
    operation,
    contentHash,
    category,
    detail: detail instanceof Error ? detail.message : detail,
  });
}

function categorizeStatus(status: number): string {
  if (status === 404) return "missing";
  if (status === 401 || status === 403) return "permission";
  if (status >= 500) return "unavailable";
  return "unexpected_status";
}

function categorizeError(err: unknown): string {
  if (err instanceof DOMException && err.name === "TimeoutError") return "timeout";
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  return "network";
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function getXmlTagValues(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "g");
  return Array.from(xml.matchAll(pattern), (match) => decodeXmlText(match[1] ?? ""));
}

function getXmlTagValue(xml: string, tagName: string): string | null {
  return getXmlTagValues(xml, tagName)[0] ?? null;
}

function contentHashFromObjectKey(key: string): string | null {
  const prefix = `${OBJECT_AUDIO_KEY_PREFIX}/`;
  const suffix = `.${OBJECT_AUDIO_EXTENSION}`;
  if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;

  const encodedHash = key.slice(prefix.length, -suffix.length);
  try {
    return decodeURIComponent(encodedHash);
  } catch {
    return encodedHash;
  }
}

export type PutAudioResult = { ok: boolean; category?: string };

/**
 * Like `putAudio` but reports the failure category so callers can surface *why* the
 * mirror upload failed (unconfigured / too_large / permission / timeout / network /
 * unavailable) instead of only logging it.
 */
export async function putAudioResult(
  audio: Buffer | ArrayBuffer | Uint8Array,
  contentHash: string,
  contentType = OBJECT_AUDIO_CONTENT_TYPE,
): Promise<PutAudioResult> {
  const config = getObjectStorageConfig();
  if (!config) {
    logObjectFailure("put", contentHash, "unconfigured");
    return { ok: false, category: "unconfigured" };
  }

  const byteLength = getAudioByteLength(audio);
  const maxBytes = getMaxAudioBytes();
  if (byteLength > maxBytes) {
    logObjectFailure("put", contentHash, "too_large", { byteLength, maxBytes });
    return { ok: false, category: "too_large" };
  }

  try {
    const response = await getObjectClient(config).fetch(getObjectUrl(config, contentHash), {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        // Backblaze B2 rejects PUTs without a length (HTTP 411). Set it explicitly:
        // some runtimes (e.g. Next's patched fetch) don't derive Content-Length from
        // an ArrayBuffer body, which left B2 chunked and refused. R2 tolerated this.
        // aws4fetch lists content-length as unsignable, so this doesn't affect SigV4.
        "Content-Length": String(byteLength),
      },
      body: toArrayBufferBody(audio),
      signal: AbortSignal.timeout(OBJECT_PUT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const category = categorizeStatus(response.status);
      logObjectFailure("put", contentHash, category, response.status);
      return { ok: false, category };
    }

    return { ok: true };
  } catch (err) {
    const category = categorizeError(err);
    logObjectFailure("put", contentHash, category, err);
    return { ok: false, category };
  }
}

export async function putAudio(
  audio: Buffer | ArrayBuffer | Uint8Array,
  contentHash: string,
  contentType = OBJECT_AUDIO_CONTENT_TYPE,
): Promise<boolean> {
  return (await putAudioResult(audio, contentHash, contentType)).ok;
}

export async function getAudio(
  contentHash: string,
  provider: ObjectStorageProvider = getActiveObjectStorageProvider(),
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const config = getObjectStorageConfig(provider);
  if (!config) {
    logObjectFailure("get", contentHash, "unconfigured");
    return null;
  }

  try {
    const response = await getObjectClient(config).fetch(getObjectUrl(config, contentHash), {
      method: "GET",
      headers: {
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
      },
      signal: AbortSignal.timeout(OBJECT_GET_TIMEOUT_MS),
    });

    if (!response.ok) {
      logObjectFailure("get", contentHash, categorizeStatus(response.status), response.status);
      return null;
    }

    const maxBytes = getMaxAudioBytes();
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      logObjectFailure("get", contentHash, "too_large", { byteLength: contentLength, maxBytes });
      return null;
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) {
      logObjectFailure("get", contentHash, "too_large", { byteLength: body.byteLength, maxBytes });
      return null;
    }

    return {
      body,
      contentType: response.headers.get("content-type") ?? OBJECT_AUDIO_CONTENT_TYPE,
    };
  } catch (err) {
    logObjectFailure("get", contentHash, categorizeError(err), err);
    return null;
  }
}

export async function hasAudio(
  contentHash: string,
  provider: ObjectStorageProvider = getActiveObjectStorageProvider(),
): Promise<boolean | null> {
  const config = getObjectStorageConfig(provider);
  if (!config) {
    logObjectFailure("head", contentHash, "unconfigured");
    return null;
  }

  try {
    const response = await getObjectClient(config).fetch(getObjectUrl(config, contentHash), {
      method: "HEAD",
      signal: AbortSignal.timeout(OBJECT_HEAD_TIMEOUT_MS),
    });

    if (response.ok) return true;
    if (response.status === 404) return false;

    logObjectFailure("head", contentHash, categorizeStatus(response.status), response.status);
    return null;
  } catch (err) {
    logObjectFailure("head", contentHash, categorizeError(err), err);
    return null;
  }
}

export async function listAudioContentHashes(
  provider: ObjectStorageProvider = getActiveObjectStorageProvider(),
): Promise<Set<string> | null> {
  const config = getObjectStorageConfig(provider);
  if (!config) {
    logObjectFailure("list", "*", "unconfigured");
    return null;
  }

  const hashes = new Set<string>();
  let continuationToken: string | null = null;

  try {
    do {
      const params = new URLSearchParams({
        "list-type": "2",
        prefix: `${OBJECT_AUDIO_KEY_PREFIX}/`,
        "max-keys": "1000",
      });
      if (continuationToken) {
        params.set("continuation-token", continuationToken);
      }

      const response = await getObjectClient(config).fetch(getBucketUrl(config, params), {
        method: "GET",
        signal: AbortSignal.timeout(OBJECT_GET_TIMEOUT_MS),
      });

      if (!response.ok) {
        logObjectFailure("list", "*", categorizeStatus(response.status), response.status);
        return null;
      }

      const xml = await response.text();
      for (const key of getXmlTagValues(xml, "Key")) {
        const hash = contentHashFromObjectKey(key);
        if (hash) hashes.add(hash);
      }

      const isTruncated = getXmlTagValue(xml, "IsTruncated") === "true";
      continuationToken = isTruncated
        ? getXmlTagValue(xml, "NextContinuationToken")
        : null;
    } while (continuationToken);

    return hashes;
  } catch (err) {
    logObjectFailure("list", "*", categorizeError(err), err);
    return null;
  }
}
