import { describe, it, expect } from "vitest";
import { expectsNonLatinScript, looksUntranslated } from "@/lib/translation-validate";

describe("expectsNonLatinScript", () => {
  it("flags non-Latin languages", () => {
    expect(expectsNonLatinScript("ko")).toBe(true);
    expect(expectsNonLatinScript("ja")).toBe(true);
    expect(expectsNonLatinScript("ru")).toBe(true);
    expect(expectsNonLatinScript("uk-UA")).toBe(true);
  });

  it("does not flag Latin-script languages", () => {
    expect(expectsNonLatinScript("en")).toBe(false);
    expect(expectsNonLatinScript("es")).toBe(false);
    expect(expectsNonLatinScript("vi")).toBe(false);
    expect(expectsNonLatinScript("cs")).toBe(false);
  });
});

describe("looksUntranslated", () => {
  it("flags Latin-only output for a non-Latin target", () => {
    expect(looksUntranslated("annyeong", "ko")).toBe(true);
    expect(looksUntranslated("privet", "ru")).toBe(true);
  });

  it("accepts proper native-script output", () => {
    expect(looksUntranslated("안녕하세요", "ko")).toBe(false);
    expect(looksUntranslated("привет", "ru")).toBe(false);
    expect(looksUntranslated("こんにちは", "ja")).toBe(false);
  });

  it("never flags Latin-script target languages (avoids identical-word false positives)", () => {
    expect(looksUntranslated("hotel", "es")).toBe(false);
    expect(looksUntranslated("taxi", "cs")).toBe(false);
  });

  it("ignores digits and punctuation when judging", () => {
    expect(looksUntranslated("123", "ko")).toBe(false);
    expect(looksUntranslated("", "ko")).toBe(false);
  });
});
