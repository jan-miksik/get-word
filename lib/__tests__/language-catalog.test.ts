import { describe, expect, it, vi } from "vitest";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";

vi.mock("@/lib/google-api-usage-events", () => ({
  recordGoogleApiUsageEvent: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({
  fetchGoogleSupportedLanguages: () => Promise.resolve([
    { code: "en", name: "English", source: "google" },
    { code: "cs", name: "Czech", source: "google" },
    { code: "hi", name: "Hindi", source: "google" },
    { code: "bn", name: "Bengali", source: "google" },
    { code: "zh", name: "Chinese (Simplified)", source: "google" },
    { code: "zh-CN", name: "Chinese (Simplified)", source: "google" },
    { code: "pt-PT", name: "Portuguese (Portugal)", source: "google" },
  ]),
}));

describe("learning language catalog", () => {
  it("returns translate-first languages with fallback TTS availability", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "");

    const languages = await getLearningLanguageCatalog("en");
    const czech = languages.find((language) => language.code === "cs");
    const english = languages.find((language) => language.code === "en");

    // "en" is the British entry, so it is labelled as such rather than as a
    // second, indistinguishable "English" next to the American one.
    expect(english?.name).toBe("English (UK)");
    expect(czech?.ttsAvailable).toBe(true);
  });

  it("sorts featured app languages before approximate speaker count", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "");

    const languages = await getLearningLanguageCatalog("en");
    const czechIndex = languages.findIndex((language) => language.code === "cs");
    const vietnameseIndex = languages.findIndex((language) => language.code === "vi");
    const englishIndex = languages.findIndex((language) => language.code === "en");
    const hindiIndex = languages.findIndex((language) => language.code === "hi");
    const bengaliIndex = languages.findIndex((language) => language.code === "bn");

    expect(czechIndex).toBeGreaterThanOrEqual(0);
    expect(vietnameseIndex).toBeGreaterThanOrEqual(0);
    expect(englishIndex).toBeGreaterThanOrEqual(0);
    expect(hindiIndex).toBeGreaterThanOrEqual(0);
    expect(bengaliIndex).toBeGreaterThanOrEqual(0);
    expect(czechIndex).toBeLessThan(vietnameseIndex);
    expect(vietnameseIndex).toBeLessThan(englishIndex);
    expect(hindiIndex).toBeLessThan(bengaliIndex);
  });

  it("excludes hidden learning languages from the catalog", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "");

    const languages = await getLearningLanguageCatalog("en");

    // pt-PT is redundant with the base "pt" Portuguese entry, so it stays hidden.
    expect(languages.some((language) => language.code === "pt-PT")).toBe(false);
    // Bare "zh" duplicates "zh-CN" (both Simplified Mandarin), so it stays hidden.
    expect(languages.some((language) => language.code === "zh")).toBe(false);
    // The explicit "zh-CN" entry is the single Simplified-Chinese option we keep.
    expect(languages.some((language) => language.code === "zh-CN")).toBe(true);
  });

  it("offers British and American English separately, each with only its own voices", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          voices: [
            { name: "en-GB-Chirp3-HD-Aoede", languageCodes: ["en-GB"], ssmlGender: "FEMALE" },
            { name: "en-US-Chirp3-HD-Puck", languageCodes: ["en-US"], ssmlGender: "MALE" },
            { name: "en-AU-Chirp3-HD-Zephyr", languageCodes: ["en-AU"], ssmlGender: "FEMALE" },
            { name: "en-IN-Chirp3-HD-Kore", languageCodes: ["en-IN"], ssmlGender: "FEMALE" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    try {
      // Fresh module instance: the catalog snapshots Google's voice list for two weeks.
      vi.resetModules();
      const { getLearningLanguageCatalog: freshCatalog } = await import("@/lib/language-catalog");
      const languages = await freshCatalog("en");
      const british = languages.find((language) => language.code === "en");
      const american = languages.find((language) => language.code === "en-US");

      expect(british?.displayCode).toBe("en-GB");
      expect(american?.name).toBe("English (US)");
      expect(american?.flag).toBe("🇺🇸");

      // The point of the split: no Australian or Indian voice reads a British
      // or American list any more.
      expect(british?.ttsVoices).toEqual(["en-GB-Chirp3-HD-Aoede"]);
      expect(american?.ttsVoices).toEqual(["en-US-Chirp3-HD-Puck"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("restricts the Chirp3-HD mix to the variant's own locale", async () => {
    vi.stubEnv("GOOGLE_TTS_API_KEY", "test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          voices: [
            { name: "en-GB-Chirp3-HD-Aoede", languageCodes: ["en-GB"] },
            { name: "en-US-Chirp3-HD-Puck", languageCodes: ["en-US"] },
            { name: "en-AU-Chirp3-HD-Zephyr", languageCodes: ["en-AU"] },
            { name: "cs-CZ-Chirp3-HD-Kore", languageCodes: ["cs-CZ"] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    try {
      vi.resetModules();
      const { getGoogleChirp3HdVoices } = await import("@/lib/language-catalog");

      expect(await getGoogleChirp3HdVoices("en")).toEqual(["en-GB-Chirp3-HD-Aoede"]);
      expect(await getGoogleChirp3HdVoices("en-US")).toEqual(["en-US-Chirp3-HD-Puck"]);
      // A language with no variant split keeps pooling by base.
      expect(await getGoogleChirp3HdVoices("cs")).toEqual(["cs-CZ-Chirp3-HD-Kore"]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("attaches Google's Mandarin (cmn-*) voices to Chinese (zh-*)", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "test-key");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          voices: [
            {
              name: "cmn-CN-Wavenet-A",
              languageCodes: ["cmn-CN"],
              ssmlGender: "FEMALE",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    try {
      const languages = await getLearningLanguageCatalog("en");
      const simplified = languages.find((language) => language.code === "zh-CN");

      expect(simplified?.ttsAvailable).toBe(true);
      expect(simplified?.preferredVoice).toBe("cmn-CN-Wavenet-A");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
