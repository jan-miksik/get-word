import { describe, expect, it, vi } from "vitest";
import { getLearningLanguageCatalog } from "@/lib/language-catalog";

vi.mock("@/lib/i18n/server", () => ({
  fetchGoogleSupportedLanguages: () => Promise.resolve([
    { code: "en", name: "English", source: "google" },
    { code: "cs", name: "Czech", source: "google" },
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
});
