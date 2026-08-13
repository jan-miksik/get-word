import { afterEach, describe, expect, it, vi } from "vitest";

const { recordGoogleApiUsageEvent } = vi.hoisted(() => ({
  recordGoogleApiUsageEvent: vi.fn(),
}));

vi.mock("@/lib/google-api-usage-events", () => ({
  recordGoogleApiUsageEvent,
}));

vi.mock("@/lib/providers/store", () => ({
  getProviderSecret: vi.fn(),
}));

import { googleTranslate } from "@/lib/translation";

describe("googleTranslate usage events", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("records each successful Google batch with its source and character count", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        new Response(
          JSON.stringify({ data: { translations: [{ translatedText: "Ahoj světe" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await googleTranslate(["Hello world"], "en", "cs", {
      source: "translation_batch",
      userId: "user-1",
    });

    expect(result[0]).toMatchObject({ status: "ok", translated: "Ahoj světe" });
    expect(recordGoogleApiUsageEvent).toHaveBeenCalledWith({
      scope: "translate",
      source: "translation_batch",
      userId: "user-1",
      model: "nmt-v2",
      units: 11,
      requestCount: 1,
    });
  });
});
