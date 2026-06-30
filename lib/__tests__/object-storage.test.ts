import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getActiveObjectStorageProvider,
  getAudio,
  hasAudio,
  isObjectStorageConfigured,
  listAudioContentHashes,
  objectKeyForHash,
  putAudio,
  OBJECT_DEFAULT_MAX_AUDIO_BYTES,
  OBJECT_GET_TIMEOUT_MS,
  OBJECT_HEAD_TIMEOUT_MS,
  OBJECT_PUT_TIMEOUT_MS,
} from "@/lib/object-storage";

const OBJECT_URL =
  "https://s3.eu-central-003.backblazeb2.com/tts-audio/audio/abc123.mp3";

function configureObjectStore() {
  vi.stubEnv("AUDIO_OBJECT_STORE_PROVIDER", "b2");
  vi.stubEnv("AUDIO_OBJECT_STORE_ENDPOINT", "https://s3.eu-central-003.backblazeb2.com");
  vi.stubEnv("AUDIO_OBJECT_STORE_REGION", "eu-central-003");
  vi.stubEnv("AUDIO_OBJECT_STORE_ACCESS_KEY_ID", "access-key");
  vi.stubEnv("AUDIO_OBJECT_STORE_SECRET_ACCESS_KEY", "secret-key");
  vi.stubEnv("AUDIO_OBJECT_STORE_BUCKET", "tts-audio");
}

function getFetchUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return init?.method ?? (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET");
}

function getFetchHeader(input: RequestInfo | URL, init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined);
  return new Headers(headers).get(name);
}

function neverResolvingFetch() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal ?? (typeof input !== "string" && !(input instanceof URL) ? input.signal : undefined);
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Timed out", "AbortError"));
    }
    return Promise.reject(new Error("Expected an aborted signal"));
  });
}

describe("object-storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("builds deterministic mp3 keys from content hashes", () => {
    expect(objectKeyForHash("abc123")).toBe("audio/abc123.mp3");
    expect(objectKeyForHash("abc/123")).toBe("audio/abc%2F123.mp3");
  });

  it("resolves the active provider from env and falls back to b2", () => {
    expect(getActiveObjectStorageProvider()).toBe("b2");
    vi.stubEnv("AUDIO_OBJECT_STORE_PROVIDER", "b2");
    expect(getActiveObjectStorageProvider()).toBe("b2");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AUDIO_OBJECT_STORE_PROVIDER", "nope");
    expect(getActiveObjectStorageProvider()).toBe("b2");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("reports configured only when credentials, bucket, endpoint, and region exist", () => {
    expect(isObjectStorageConfigured()).toBe(false);
    configureObjectStore();
    expect(isObjectStorageConfigured()).toBe(true);
    vi.stubEnv("AUDIO_OBJECT_STORE_REGION", "");
    expect(isObjectStorageConfigured()).toBe(false);
  });

  it("puts audio to the expected signed B2 object URL", async () => {
    configureObjectStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(true);

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchUrl(input)).toBe(OBJECT_URL);
    expect(getFetchMethod(input, init)).toBe("PUT");
    expect(getFetchHeader(input, init, "content-type")).toBe("audio/mpeg");
  });

  it("signs requests with the configured B2 region", async () => {
    configureObjectStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await putAudio(Buffer.from("audio"), "abc123");

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const authorization = getFetchHeader(input, init, "authorization") ?? "";
    expect(authorization).toContain("/eu-central-003/s3/aws4_request");
  });

  it("returns null when reading a row whose provider is not the active one", async () => {
    configureObjectStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(Buffer.from("audio"), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // "r2" is not the active/supported provider, so it cannot be served.
    await expect(getAudio("abc123", "r2" as never)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("refuses to put audio larger than the configured safety cap", async () => {
    configureObjectStore();
    vi.stubEnv("AUDIO_OBJECT_STORE_MAX_OBJECT_BYTES", "4");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      category: "too_large",
      detail: { byteLength: 5, maxBytes: 4 },
    }));
    warnSpy.mockRestore();
  });

  it("returns false without throwing when put is unconfigured, rejected, non-2xx, or timed out", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    configureObjectStore();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(OBJECT_PUT_TIMEOUT_MS);
    warnSpy.mockRestore();
  });

  it("gets audio from object storage and returns content type", async () => {
    configureObjectStore();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from("audio"), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const audio = await getAudio("abc123");

    expect(audio?.contentType).toBe("audio/mpeg");
    expect(audio?.body.byteLength).toBe(5);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchUrl(input)).toBe(OBJECT_URL);
    expect(getFetchMethod(input, init)).toBe("GET");
  });

  it("checks object presence with HEAD without downloading audio", async () => {
    configureObjectStore();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(hasAudio("abc123")).resolves.toBe(true);

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchUrl(input)).toBe(OBJECT_URL);
    expect(getFetchMethod(input, init)).toBe("HEAD");
  });

  it("lists existing audio content hashes from bucket inventory pages", async () => {
    configureObjectStore();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>true</IsTruncated>
          <Contents><Key>audio/abc123.mp3</Key></Contents>
          <Contents><Key>audio/abc%2F456.mp3</Key></Contents>
          <Contents><Key>other/ignored.mp3</Key></Contents>
          <NextContinuationToken>token&amp;1</NextContinuationToken>
        </ListBucketResult>`, { status: 200 }))
      .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>audio/final.mp3</Key></Contents>
        </ListBucketResult>`, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAudioContentHashes()).resolves.toEqual(
      new Set(["abc123", "abc/456", "final"]),
    );

    const [firstInput, firstInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const [secondInput, secondInit] = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchMethod(firstInput, firstInit)).toBe("GET");
    expect(getFetchUrl(firstInput)).toContain("list-type=2");
    expect(getFetchUrl(firstInput)).toContain("prefix=audio%2F");
    expect(getFetchUrl(secondInput)).toContain("continuation-token=token%261");
    expect(getFetchMethod(secondInput, secondInit)).toBe("GET");
  });

  it("refuses to return audio larger than the configured safety cap", async () => {
    configureObjectStore();
    vi.stubEnv("AUDIO_OBJECT_STORE_MAX_OBJECT_BYTES", "4");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(Buffer.from("audio"), {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": "5",
        },
      }),
    ));

    await expect(getAudio("abc123")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      category: "too_large",
      detail: { byteLength: 5, maxBytes: 4 },
    }));
    warnSpy.mockRestore();
  });

  it("falls back to the default safety cap when env is invalid", async () => {
    configureObjectStore();
    vi.stubEnv("AUDIO_OBJECT_STORE_MAX_OBJECT_BYTES", "nope");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.alloc(OBJECT_DEFAULT_MAX_AUDIO_BYTES + 1), "abc123")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on get misses and logs 403 separately from 404", async () => {
    configureObjectStore();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await expect(getAudio("missing")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      category: "missing",
    }));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    await expect(getAudio("forbidden")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      category: "permission",
    }));
    warnSpy.mockRestore();
  });

  it("returns false for HEAD misses and null when presence cannot be verified", async () => {
    configureObjectStore();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(hasAudio("missing")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(hasAudio("forbidden")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      operation: "head",
      category: "permission",
    }));

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(hasAudio("timeout")).resolves.toBeNull();
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(OBJECT_HEAD_TIMEOUT_MS);
    warnSpy.mockRestore();
  });

  it("returns null when inventory listing is unavailable", async () => {
    configureObjectStore();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));

    await expect(listAudioContentHashes()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] object storage failure", expect.objectContaining({
      operation: "list",
      category: "unavailable",
    }));
    warnSpy.mockRestore();
  });

  it("returns null when get is unconfigured, unavailable, rejected, or timed out", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(getAudio("abc123")).resolves.toBeNull();

    configureObjectStore();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(getAudio("abc123")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(getAudio("abc123")).resolves.toBeNull();

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(getAudio("abc123")).resolves.toBeNull();
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(OBJECT_GET_TIMEOUT_MS);
    warnSpy.mockRestore();
  });
});
