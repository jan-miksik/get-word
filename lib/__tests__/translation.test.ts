import { describe, expect, it } from "vitest";
import { buildOpenRouterTranslationPrompt } from "@/lib/translation-prompt";

describe("buildOpenRouterTranslationPrompt", () => {
  it("omits batch context when there are no previous translations", () => {
    const prompt = buildOpenRouterTranslationPrompt({
      texts: ["hello"],
      fromLang: "en",
      toLang: "cs",
    });

    expect(prompt).toContain("Translate the following 1 items from en to cs.");
    expect(prompt).not.toContain("Previously translated pairs");
    expect(prompt).toContain("1. hello");
  });

  it("adds previous translated pairs as read-only consistency context", () => {
    const prompt = buildOpenRouterTranslationPrompt({
      texts: ["Do you speak English?"],
      fromLang: "en",
      toLang: "vi",
      previousPairs: [
        { source: "you", target: "bạn" },
        { source: "I know", target: "tôi biết" },
      ],
    });

    expect(prompt).toContain("Previously translated pairs in this same list");
    expect(prompt).toContain('"source":"you"');
    expect(prompt).toContain('"target":"bạn"');
    expect(prompt).toContain("Do not return these context pairs");
    expect(prompt).toContain("terminology, pronouns, register, and parallel sentence patterns");
  });
});
