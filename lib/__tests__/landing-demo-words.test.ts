import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LANDING_DEMO_AUDIO_LANGUAGES,
  LANDING_DEMO_WORDS,
  getLandingDemoStaticAudioEntries,
  getLandingDemoStaticAudioUrl,
} from "@/lib/landing-demo-words";

describe("landing demo static audio", () => {
  it("maps every demo word to a bundled mp3 file", () => {
    for (const lang of LANDING_DEMO_AUDIO_LANGUAGES) {
      const words = LANDING_DEMO_WORDS[lang];
      const entries = getLandingDemoStaticAudioEntries(lang);
      expect(entries).toHaveLength(words.length);

      entries.forEach((entry, index) => {
        expect(entry.text).toBe(words[index].text);
        expect(entry.url).toBe(`/audio/demo/${encodeURIComponent(lang)}/${index + 1}.mp3`);
        expect(
          existsSync(path.join(process.cwd(), "public", entry.url)),
          `${lang}/${index + 1}.mp3 exists`,
        ).toBe(true);
      });
    }
  });

  it("returns null for unsupported static audio lookups", () => {
    expect(getLandingDemoStaticAudioUrl("xx", 0)).toBeNull();
    expect(getLandingDemoStaticAudioUrl("cs", 99)).toBeNull();
  });
});
