import { afterEach, describe, expect, it, vi } from "vitest";
import { getPlayableAudioFields, isPlayableAudioAsset } from "@/lib/audio-assets";

describe("audio asset playability", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("treats private object_store assets as playable through the app proxy route", () => {
    vi.stubEnv("MEDIA_PROXY_WORKER_URL", "");
    const asset = {
      contentHash: "abc123",
      storageType: "object_store",
      storageRef: "audio/abc123.mp3",
    };

    expect(isPlayableAudioAsset(asset)).toBe(true);
    expect(getPlayableAudioFields(asset)).toEqual({
      url: "/api/audio/abc123",
      arweaveUrl: null,
      arweaveUrls: [],
      storageRef: "audio/abc123.mp3",
      voiceId: null,
    });
  });

  it("does not treat legacy r2 assets as playable (R2 has been removed)", () => {
    const asset = {
      contentHash: "abc123",
      storageType: "r2",
      storageRef: "audio/abc123.mp3",
    };

    expect(isPlayableAudioAsset(asset)).toBe(false);
    expect(getPlayableAudioFields(asset)).toEqual({
      url: null,
      arweaveUrl: null,
      arweaveUrls: [],
      storageRef: "audio/abc123.mp3",
      voiceId: null,
    });
  });
});
