import { describe, expect, it, vi } from "vitest";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";

vi.mock("@/lib/i18n/server", () => ({
  fetchGoogleSupportedLanguages: () => Promise.resolve([
    { code: "en", name: "English", source: "google" },
    { code: "cs", name: "Czech", source: "google" },
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

  it("sorts learning languages by approximate speaker count before name", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "");

    const languages = await getLearningLanguageCatalog("en");
    const englishIndex = languages.findIndex((language) => language.code === "en");
    const czechIndex = languages.findIndex((language) => language.code === "cs");

    expect(englishIndex).toBeGreaterThanOrEqual(0);
    expect(czechIndex).toBeGreaterThanOrEqual(0);
    expect(englishIndex).toBeLessThan(czechIndex);
  });

  it("excludes hidden learning languages from the catalog", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubEnv("GOOGLE_TTS_API_KEY", "");

    const languages = await getLearningLanguageCatalog("en");

    expect(languages.some((language) => language.code === "zh-CN")).toBe(false);
    expect(languages.some((language) => language.code === "pt-PT")).toBe(false);
  });
});
