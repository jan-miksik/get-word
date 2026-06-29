import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAudio,
  hasAudio,
  isR2Configured,
  listAudioContentHashes,
  putAudio,
  r2KeyForHash,
  R2_DEFAULT_MAX_AUDIO_BYTES,
  R2_GET_TIMEOUT_MS,
  R2_HEAD_TIMEOUT_MS,
  R2_PUT_TIMEOUT_MS,
} from "@/lib/r2-storage";

function configureR2() {
  vi.stubEnv("R2_ACCOUNT_ID", "account-123");
  vi.stubEnv("R2_ACCESS_KEY_ID", "access-key");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret-key");
  vi.stubEnv("R2_BUCKET", "tts-audio");
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

describe("r2-storage", () => {
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
    expect(r2KeyForHash("abc123")).toBe("audio/abc123.mp3");
    expect(r2KeyForHash("abc/123")).toBe("audio/abc%2F123.mp3");
  });

  it("reports configured only when credentials, bucket, and endpoint inputs exist", () => {
    expect(isR2Configured()).toBe(false);
    configureR2();
    expect(isR2Configured()).toBe(true);
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_S3_ENDPOINT", "https://r2.example.test");
    expect(isR2Configured()).toBe(true);
  });

  it("puts audio to the expected signed R2 object URL", async () => {
    configureR2();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(true);

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchUrl(input)).toBe("https://account-123.r2.cloudflarestorage.com/tts-audio/audio/abc123.mp3");
    expect(getFetchMethod(input, init)).toBe("PUT");
    expect(getFetchHeader(input, init, "content-type")).toBe("audio/mpeg");
  });

  it("refuses to put audio larger than the configured R2 safety cap", async () => {
    configureR2();
    vi.stubEnv("R2_MAX_AUDIO_BYTES", "4");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      category: "too_large",
      detail: { byteLength: 5, maxBytes: 4 },
    }));
    warnSpy.mockRestore();
  });

  it("returns false without throwing when put is unconfigured, rejected, non-2xx, or timed out", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    configureR2();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(putAudio(Buffer.from("audio"), "abc123")).resolves.toBe(false);
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(R2_PUT_TIMEOUT_MS);
    warnSpy.mockRestore();
  });

  it("gets audio from R2 and returns content type", async () => {
    configureR2();
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
    expect(getFetchUrl(input)).toBe("https://account-123.r2.cloudflarestorage.com/tts-audio/audio/abc123.mp3");
    expect(getFetchMethod(input, init)).toBe("GET");
  });

  it("checks R2 object presence with HEAD without downloading audio", async () => {
    configureR2();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(hasAudio("abc123")).resolves.toBe(true);

    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    expect(getFetchUrl(input)).toBe("https://account-123.r2.cloudflarestorage.com/tts-audio/audio/abc123.mp3");
    expect(getFetchMethod(input, init)).toBe("HEAD");
  });

  it("lists existing R2 audio content hashes from bucket inventory pages", async () => {
    configureR2();
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

  it("refuses to return R2 audio larger than the configured safety cap", async () => {
    configureR2();
    vi.stubEnv("R2_MAX_AUDIO_BYTES", "4");
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
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      category: "too_large",
      detail: { byteLength: 5, maxBytes: 4 },
    }));
    warnSpy.mockRestore();
  });

  it("falls back to the default R2 audio safety cap when env is invalid", async () => {
    configureR2();
    vi.stubEnv("R2_MAX_AUDIO_BYTES", "nope");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(putAudio(Buffer.alloc(R2_DEFAULT_MAX_AUDIO_BYTES + 1), "abc123")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on get misses and logs 403 separately from 404", async () => {
    configureR2();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await expect(getAudio("missing")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      category: "missing",
    }));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    await expect(getAudio("forbidden")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      category: "permission",
    }));
    warnSpy.mockRestore();
  });

  it("returns false for HEAD misses and null when presence cannot be verified", async () => {
    configureR2();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(hasAudio("missing")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(hasAudio("forbidden")).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      operation: "head",
      category: "permission",
    }));

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(hasAudio("timeout")).resolves.toBeNull();
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(R2_HEAD_TIMEOUT_MS);
    warnSpy.mockRestore();
  });

  it("returns null when R2 inventory listing is unavailable", async () => {
    configureR2();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));

    await expect(listAudioContentHashes()).resolves.toBeNull();
    expect(warnSpy).toHaveBeenLastCalledWith("[Get Word audio] R2 storage failure", expect.objectContaining({
      operation: "list",
      category: "unavailable",
    }));
    warnSpy.mockRestore();
  });

  it("returns null when get is unconfigured, unavailable, rejected, or timed out", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(getAudio("abc123")).resolves.toBeNull();

    configureR2();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(getAudio("abc123")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(getAudio("abc123")).resolves.toBeNull();

    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
    vi.stubGlobal("fetch", neverResolvingFetch());
    await expect(getAudio("abc123")).resolves.toBeNull();
    expect(AbortSignal.timeout).toHaveBeenLastCalledWith(R2_GET_TIMEOUT_MS);
    warnSpy.mockRestore();
  });
});
