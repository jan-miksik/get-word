import { describe, expect, it } from "vitest";
import {
  buildLanguageVariantRules,
  buildOpenRouterTranslationPrompt,
  LIST_GENERATION_RULES,
  COMMENT_GENERATION_RULES,
  COMMENT_SYSTEM_PROMPT,
  TRANSLATION_QUALITY_RULES,
  TRANSLATION_SYSTEM_PROMPT,
} from "@/lib/translation-prompt";

describe("translation prompt rules", () => {
  it("prioritizes faithful simple translations without language-specific assumptions", () => {
    expect(TRANSLATION_SYSTEM_PROMPT).toContain("all and only the meaning");
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "Naturalness is not permission to enrich",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "Do not add optional meaning that is absent from the source",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "natural complete utterance, grammaticality, idiomatic reference",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "A standalone vocabulary item must also work as a useful standalone learning item",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "the later duplicate MAY use a construction-bound equivalent",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain(
      "neutral everyday request form of the target language",
    );
    expect(TRANSLATION_QUALITY_RULES).toContain("parallel translation pattern");
    expect(TRANSLATION_QUALITY_RULES.toLowerCase()).not.toContain("vietnamese");
  });
});

describe("list generation rules", () => {
  it("adds sequencing rules that are separate from row translation", () => {
    expect(LIST_GENERATION_RULES).toContain("teaching sequence");
    expect(LIST_GENERATION_RULES).toContain(
      "introduce important content words as standalone rows",
    );
    expect(LIST_GENERATION_RULES).toContain(
      "source inventory is fixed",
    );
    expect(LIST_GENERATION_RULES).toContain("Both sides must be natural");
    expect(LIST_GENERATION_RULES).toContain("A learner should not repeatedly encounter");
  });
});

describe("regional variant rules", () => {
  it("pins the target's English variant", () => {
    const rules = buildLanguageVariantRules({ fromLang: "cs", toLang: "en-US" });

    expect(rules).toContain("The target is American English");
    expect(rules).toContain("never mix in another regional variant");
    // Czech has no variant split, so nothing is claimed about the source.
    expect(rules).not.toContain("The source is");
  });

  it("treats bare English as the British variant", () => {
    expect(buildLanguageVariantRules({ fromLang: "cs", toLang: "en" })).toContain(
      "The target is British English",
    );
  });

  it("marks the source variant without letting it drive the target", () => {
    const rules = buildLanguageVariantRules({ fromLang: "en-US", toLang: "cs" });

    expect(rules).toContain("The source is American English");
    expect(rules).toContain("does not change which variant the target uses");
  });

  it("adds nothing for a pair with no variant to enforce", () => {
    expect(buildLanguageVariantRules({ fromLang: "cs", toLang: "vi" })).toBe("");
  });

  it("carries the rule into the translation prompt itself", () => {
    const prompt = buildOpenRouterTranslationPrompt({
      texts: ["barva"],
      fromLang: "cs",
      toLang: "en-US",
    });

    expect(prompt).toContain("The target is American English");
    expect(prompt).toContain("Preserve ALL AND ONLY the meaning of the source");
  });
});

describe("comment prompt rules", () => {
  it("treats comments as sparse study notes, not translation repairs", () => {
    expect(COMMENT_SYSTEM_PROMPT).toContain(
      "Never use a comment to criticize, repair, apologize for, or replace a bad translation",
    );
    expect(COMMENT_GENERATION_RULES).toContain("construction-dependent meaning");
    expect(COMMENT_GENERATION_RULES).toContain("phrase structure");
    expect(COMMENT_GENERATION_RULES).toContain(
      "unavoidable grammatical particle or function word",
    );
    expect(COMMENT_GENERATION_RULES).toContain("Never write meta-comments");
  });
  it("asks for per-item address forms only when the target has a binary system", () => {
    const base = {
      texts: ["Where is the station?"],
      fromLang: "en",
      toLang: "cs",
    };

    // No flag: nothing about address forms, and the plain JSON shape only.
    const plain = buildOpenRouterTranslationPrompt(base);
    expect(plain).not.toContain('"register"');
    expect(plain).not.toContain('"alternative"');

    const withForms = buildOpenRouterTranslationPrompt({ ...base, addressForms: true });
    expect(withForms).toContain('Set "register" to "familiar" or "polite"');
    expect(withForms).toContain('"alternative"');
  });

  it("tells the model that a source-fixed address form gets no alternative", () => {
    // The whole point of the rewrite: reporting the form and creating a second
    // item are independent, and a source that already fixed the form must not
    // spawn a twin.
    const prompt = buildOpenRouterTranslationPrompt({
      texts: ["Jak se máte?"],
      fromLang: "cs",
      toLang: "de",
      addressForms: true,
    });
    expect(prompt).toContain("including when the source itself already fixed the choice");
    expect(prompt).toContain('return "register" and NO "alternative"');
  });
});
