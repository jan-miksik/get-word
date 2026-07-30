import { afterEach, describe, expect, it, vi } from "vitest";
import { googleTTS } from "@/lib/audio";

describe("googleTTS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the selected Google voice language code for regional English voices", async () => {
    vi.stubEnv("GOOGLE_TTS_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ audioContent: Buffer.from("audio").toString("base64") }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await googleTTS("hello", "en", "en-AU-Neural2-A");

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request).toBeDefined();
    const body = JSON.parse(String(request?.body));
    expect(body.voice).toEqual({
      languageCode: "en-AU",
      name: "en-AU-Neural2-A",
    });
  });

  it("reads bare English with a British default voice, and en-US with an American one", async () => {
    vi.stubEnv("GOOGLE_TTS_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({ audioContent: Buffer.from("audio").toString("base64") }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await googleTTS("colour", "en");
    await googleTTS("color", "en-US");

    const languageCodes = fetchMock.mock.calls.map(
      (call) => JSON.parse(String(call[1]?.body)).voice.languageCode,
    );
    expect(languageCodes).toEqual(["en-GB", "en-US"]);
  });
});
