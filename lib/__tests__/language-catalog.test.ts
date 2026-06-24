import { describe, expect, it, vi } from "vitest";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";

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

    expect(english?.name).toBe("English");
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
