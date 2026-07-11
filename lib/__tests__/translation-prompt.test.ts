import { describe, expect, it } from "vitest";
import {
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
});
