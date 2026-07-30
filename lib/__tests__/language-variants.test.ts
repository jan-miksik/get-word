import { describe, expect, it } from "vitest";
import {
  describeLanguageVariant,
  resolveLanguageVariantLocale,
  toBaseLanguageForTranslationApi,
} from "@/lib/language-variants";

describe("resolveLanguageVariantLocale", () => {
  it("treats bare English as British, which is what existing lists store", () => {
    expect(resolveLanguageVariantLocale("en")).toBe("en-GB");
    expect(resolveLanguageVariantLocale("EN")).toBe("en-GB");
  });

  it("keeps an explicit English variant", () => {
    expect(resolveLanguageVariantLocale("en-US")).toBe("en-US");
    expect(resolveLanguageVariantLocale("en-gb")).toBe("en-GB");
  });

  it("falls back to British for an English region the app does not offer", () => {
    expect(resolveLanguageVariantLocale("en-AU")).toBe("en-GB");
  });

  it("leaves languages without a variant split pooled by base", () => {
    // Locale-scoping these would break them: Chinese voices live under Google's
    // "cmn-*" codes, and Portuguese pools its Brazilian voices under "pt".
    expect(resolveLanguageVariantLocale("zh-CN")).toBeNull();
    expect(resolveLanguageVariantLocale("pt")).toBeNull();
    expect(resolveLanguageVariantLocale("cs")).toBeNull();
  });
});

describe("toBaseLanguageForTranslationApi", () => {
  it("drops the English region, which Google Translate v2 rejects", () => {
    expect(toBaseLanguageForTranslationApi("en-US")).toBe("en");
    expect(toBaseLanguageForTranslationApi("en")).toBe("en");
  });

  it("keeps regional codes the API actually supports", () => {
    expect(toBaseLanguageForTranslationApi("zh-CN")).toBe("zh-CN");
    expect(toBaseLanguageForTranslationApi("pt-BR")).toBe("pt-BR");
  });
});

describe("describeLanguageVariant", () => {
  it("describes each English variant for a prompt", () => {
    expect(describeLanguageVariant("en")).toContain("British English");
    expect(describeLanguageVariant("en-US")).toContain("American English");
  });

  it("returns nothing when there is no variant to enforce", () => {
    expect(describeLanguageVariant("cs")).toBeNull();
    expect(describeLanguageVariant("vi")).toBeNull();
  });
});
