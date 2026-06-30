import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_OBJECT_STORAGE_EVENT,
  reportAudioStorageResponse,
  setAudioStorageLoggingEnabled,
  withAudioDebugParam,
} from "@/lib/audio-debug";

function setPageUrl(url: string) {
  window.history.replaceState({}, "", url);
}

function audioResponse(headers: Record<string, string>): Response {
  return new Response(null, { headers });
}

describe("withAudioDebugParam", () => {
  afterEach(() => {
    setPageUrl("/");
  });

  it("leaves audio URLs alone when page debug is not enabled", () => {
    setPageUrl("/");

    expect(withAudioDebugParam("/api/audio/abc123")).toBe("/api/audio/abc123");
  });

  it("adds debug=1 to same-origin audio API URLs when page debug is enabled", () => {
    setPageUrl("/?debug=1");

    expect(withAudioDebugParam("/api/audio/abc123")).toBe("/api/audio/abc123?debug=1");
    expect(withAudioDebugParam("/api/audio/abc123?x=1")).toBe("/api/audio/abc123?x=1&debug=1");
  });

  it("does not modify non-audio or external URLs", () => {
    setPageUrl("/?debug=1");

    expect(withAudioDebugParam("/api/sync")).toBe("/api/sync");
    expect(withAudioDebugParam("https://arweave.net/tx123")).toBe("https://arweave.net/tx123");
    expect(withAudioDebugParam("blob:http://localhost/blob-id")).toBe("blob:http://localhost/blob-id");
  });
});

function stubLocation(href: string) {
  const url = new URL(href);
  vi.stubGlobal("location", {
    href: url.href,
    hostname: url.hostname,
    origin: url.origin,
    search: url.search,
    pathname: url.pathname,
    hash: url.hash,
  });
}

describe("reportAudioStorageResponse", () => {
  afterEach(() => {
    setAudioStorageLoggingEnabled(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("logs the B2 object-store source on localhost without any flags", () => {
    stubLocation("http://localhost/");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    reportAudioStorageResponse(
      audioResponse({ "x-audio-storage": "object", "x-audio-storage-provider": "b2" }),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[Get Word audio] served from object store (b2)",
      expect.objectContaining({ source: "object store (b2)", provider: "b2" }),
    );
  });

  it("logs the Arweave gateway host when served from a gateway", () => {
    stubLocation("http://localhost/");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    reportAudioStorageResponse(
      audioResponse({ "x-audio-gateway": "https://arweave.net/tx123" }),
    );

    expect(infoSpy).toHaveBeenCalledWith(
      "[Get Word audio] served from Arweave (arweave.net)",
      expect.objectContaining({ source: "Arweave (arweave.net)", gateway: "https://arweave.net/tx123" }),
    );
  });

  it("logs off-localhost when ?debug=1 is set", () => {
    stubLocation("https://getword.app/?debug=1");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    reportAudioStorageResponse(
      audioResponse({ "x-audio-storage": "object", "x-audio-storage-provider": "b2" }),
    );

    expect(infoSpy).toHaveBeenCalled();
  });

  it("logs off-localhost when editor logging is enabled", () => {
    stubLocation("https://getword.app/");
    setAudioStorageLoggingEnabled(true);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    reportAudioStorageResponse(
      audioResponse({ "x-audio-storage": "object", "x-audio-storage-provider": "b2" }),
    );

    expect(infoSpy).toHaveBeenCalled();
  });

  it("does not log off-localhost without debug or editor logging", () => {
    stubLocation("https://getword.app/");
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    reportAudioStorageResponse(
      audioResponse({ "x-audio-storage": "object", "x-audio-storage-provider": "b2" }),
    );

    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("dispatches the badge event for the object-fallback path regardless of logging", () => {
    stubLocation("https://getword.app/");
    const handler = vi.fn();
    window.addEventListener(AUDIO_OBJECT_STORAGE_EVENT, handler);

    reportAudioStorageResponse(
      audioResponse({ "x-audio-storage": "object-fallback", "x-audio-storage-provider": "b2" }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUDIO_OBJECT_STORAGE_EVENT, handler);
  });
});
