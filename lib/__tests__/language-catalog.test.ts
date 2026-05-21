import { describe, expect, it, vi } from "vitest";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";

vi.mock("@/lib/i18n/server", () => ({
  fetchGoogleSupportedLanguages: () => Promise.resolve([
    { code: "en", name: "English", source: "google" },
    { code: "cs", name: "Czech", source: "google" },
    { code: "hi", name: "Hindi", source: "google" },
    { code: "bn", name: "Bengali", source: "google" },
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

    expect(languages.some((language) => language.code === "zh-CN")).toBe(false);
    expect(languages.some((language) => language.code === "pt-PT")).toBe(false);
  });
});
