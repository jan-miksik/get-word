import { afterEach, describe, expect, it } from "vitest";
import { withAudioDebugParam } from "@/lib/audio-debug";

function setPageUrl(url: string) {
  window.history.replaceState({}, "", url);
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
