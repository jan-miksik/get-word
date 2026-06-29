import { AwsClient } from "aws4fetch";

export const R2_AUDIO_CONTENT_TYPE = "audio/mpeg";
export const R2_AUDIO_KEY_PREFIX = "audio";
export const R2_AUDIO_EXTENSION = "mp3";
export const R2_PUT_TIMEOUT_MS = 10_000;
export const R2_GET_TIMEOUT_MS = 5_000;
export const R2_HEAD_TIMEOUT_MS = 5_000;
export const R2_DEFAULT_MAX_AUDIO_BYTES = 1_000_000;

type R2Config = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

let r2Client: AwsClient | null | undefined;

export function r2KeyForHash(contentHash: string): string {
  return `${R2_AUDIO_KEY_PREFIX}/${encodeURIComponent(contentHash)}.${R2_AUDIO_EXTENSION}`;
}

function getR2Config(): R2Config | null {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const explicitEndpoint = process.env.R2_S3_ENDPOINT;
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = explicitEndpoint ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    bucket,
    accessKeyId,
    secretAccessKey,
  };
}

function getR2Client(config: R2Config): AwsClient {
  if (r2Client) return r2Client;

  r2Client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: "auto",
    service: "s3",
    retries: 0,
  });
  return r2Client;
}

function getR2ObjectUrl(config: R2Config, contentHash: string): string {
  return `${config.endpoint}/${config.bucket}/${r2KeyForHash(contentHash)}`;
}

function getR2BucketUrl(config: R2Config, params: URLSearchParams): string {
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
  const raw = process.env.R2_MAX_AUDIO_BYTES;
  if (!raw) return R2_DEFAULT_MAX_AUDIO_BYTES;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : R2_DEFAULT_MAX_AUDIO_BYTES;
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

function logR2Failure(
  operation: "put" | "get" | "head" | "list",
  contentHash: string,
  category: string,
  detail?: unknown,
) {
  console.warn("[Get Word audio] R2 storage failure", {
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

function contentHashFromR2Key(key: string): string | null {
  const prefix = `${R2_AUDIO_KEY_PREFIX}/`;
  const suffix = `.${R2_AUDIO_EXTENSION}`;
  if (!key.startsWith(prefix) || !key.endsWith(suffix)) return null;

  const encodedHash = key.slice(prefix.length, -suffix.length);
  try {
    return decodeURIComponent(encodedHash);
  } catch {
    return encodedHash;
  }
}

export async function putAudio(
  audio: Buffer | ArrayBuffer | Uint8Array,
  contentHash: string,
  contentType = R2_AUDIO_CONTENT_TYPE,
): Promise<boolean> {
  const config = getR2Config();
  if (!config) {
    logR2Failure("put", contentHash, "unconfigured");
    return false;
  }

  const byteLength = getAudioByteLength(audio);
  const maxBytes = getMaxAudioBytes();
  if (byteLength > maxBytes) {
    logR2Failure("put", contentHash, "too_large", { byteLength, maxBytes });
    return false;
  }

  try {
    const response = await getR2Client(config).fetch(getR2ObjectUrl(config, contentHash), {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
      body: toArrayBufferBody(audio),
      signal: AbortSignal.timeout(R2_PUT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logR2Failure("put", contentHash, categorizeStatus(response.status), response.status);
      return false;
    }

    return true;
  } catch (err) {
    logR2Failure("put", contentHash, categorizeError(err), err);
    return false;
  }
}

export async function getAudio(
  contentHash: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const config = getR2Config();
  if (!config) {
    logR2Failure("get", contentHash, "unconfigured");
    return null;
  }

  try {
    const response = await getR2Client(config).fetch(getR2ObjectUrl(config, contentHash), {
      method: "GET",
      headers: {
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.1",
      },
      signal: AbortSignal.timeout(R2_GET_TIMEOUT_MS),
    });

    if (!response.ok) {
      logR2Failure("get", contentHash, categorizeStatus(response.status), response.status);
      return null;
    }

    const maxBytes = getMaxAudioBytes();
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      logR2Failure("get", contentHash, "too_large", { byteLength: contentLength, maxBytes });
      return null;
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) {
      logR2Failure("get", contentHash, "too_large", { byteLength: body.byteLength, maxBytes });
      return null;
    }

    return {
      body,
      contentType: response.headers.get("content-type") ?? R2_AUDIO_CONTENT_TYPE,
    };
  } catch (err) {
    logR2Failure("get", contentHash, categorizeError(err), err);
    return null;
  }
}

export async function hasAudio(contentHash: string): Promise<boolean | null> {
  const config = getR2Config();
  if (!config) {
    logR2Failure("head", contentHash, "unconfigured");
    return null;
  }

  try {
    const response = await getR2Client(config).fetch(getR2ObjectUrl(config, contentHash), {
      method: "HEAD",
      signal: AbortSignal.timeout(R2_HEAD_TIMEOUT_MS),
    });

    if (response.ok) return true;
    if (response.status === 404) return false;

    logR2Failure("head", contentHash, categorizeStatus(response.status), response.status);
    return null;
  } catch (err) {
    logR2Failure("head", contentHash, categorizeError(err), err);
    return null;
  }
}

export async function listAudioContentHashes(): Promise<Set<string> | null> {
  const config = getR2Config();
  if (!config) {
    logR2Failure("list", "*", "unconfigured");
    return null;
  }

  const hashes = new Set<string>();
  let continuationToken: string | null = null;

  try {
    do {
      const params = new URLSearchParams({
        "list-type": "2",
        prefix: `${R2_AUDIO_KEY_PREFIX}/`,
        "max-keys": "1000",
      });
      if (continuationToken) {
        params.set("continuation-token", continuationToken);
      }

      const response = await getR2Client(config).fetch(getR2BucketUrl(config, params), {
        method: "GET",
        signal: AbortSignal.timeout(R2_GET_TIMEOUT_MS),
      });

      if (!response.ok) {
        logR2Failure("list", "*", categorizeStatus(response.status), response.status);
        return null;
      }

      const xml = await response.text();
      for (const key of getXmlTagValues(xml, "Key")) {
        const hash = contentHashFromR2Key(key);
        if (hash) hashes.add(hash);
      }

      const isTruncated = getXmlTagValue(xml, "IsTruncated") === "true";
      continuationToken = isTruncated
        ? getXmlTagValue(xml, "NextContinuationToken")
        : null;
    } while (continuationToken);

    return hashes;
  } catch (err) {
    logR2Failure("list", "*", categorizeError(err), err);
    return null;
  }
}
