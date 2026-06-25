import { describe, it, expect } from "vitest";
import {
  expectsNonLatinScript,
  isLikelySentence,
  looksUntranslated,
  missingArticleForNoun,
  missingTargetCapitalization,
  parentheticalInTranslation,
  registerMarkerMismatch,
  validateTranslation,
} from "@/lib/translation-validate";

const codes = (source: string, target: string, fromLang: string, toLang: string) =>
  validateTranslation({ source, target, fromLang, toLang }).map((w) => w.code);

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

describe("registerMarkerMismatch (FR/CS → DE)", () => {
  it("flags a formal French imperative dropped to informal German", () => {
    // Aidez-moi ! → Hilf mir!  (should be Helfen Sie mir!)
    const w = registerMarkerMismatch("Aidez-moi !", "Hilf mir!", "fr", "de");
    expect(w?.code).toBe("register_marker_mismatch");
    expect(w?.confidence).toBe("medium");
  });

  it("flags a formal 'vous' question that loses the polite form", () => {
    // Qu'est-ce qui vous fait mal ? → Was tut weh?  (should be Was tut Ihnen weh?)
    const w = registerMarkerMismatch(
      "Qu'est-ce qui vous fait mal ?",
      "Was tut weh?",
      "fr",
      "de",
    );
    expect(w?.code).toBe("register_marker_mismatch");
  });

  it("does NOT flag when the German target keeps the formal marker", () => {
    expect(registerMarkerMismatch("Aidez-moi !", "Helfen Sie mir!", "fr", "de")).toBeNull();
    expect(
      registerMarkerMismatch(
        "Qu'est-ce qui vous fait mal ?",
        "Was tut Ihnen weh?",
        "fr",
        "de",
      ),
    ).toBeNull();
  });

  it("does NOT flag a source without a formality marker", () => {
    expect(
      registerMarkerMismatch("Combien ça coûte ?", "Wie viel kostet das?", "fr", "de"),
    ).toBeNull();
  });

  it("does NOT flag French -ez stopwords (assez, nez)", () => {
    expect(registerMarkerMismatch("Assez !", "Genug!", "fr", "de")).toBeNull();
    expect(registerMarkerMismatch("le nez", "die Nase", "fr", "de")).toBeNull();
  });

  it("flags an explicit formal Czech 'vy' dropped to informal German", () => {
    expect(
      registerMarkerMismatch("Vy mluvíte anglicky?", "Sprichst du Englisch?", "cs", "de")?.code,
    ).toBe("register_marker_mismatch");
  });
});

describe("isLikelySentence", () => {
  it("treats single words and short fragments as non-sentences", () => {
    expect(isLikelySentence("und")).toBe(false);
    expect(isLikelySentence("gut")).toBe(false);
    expect(isLikelySentence("Petr und Jan")).toBe(false); // 3 words, no terminal punct
  });
  it("treats punctuated or long strings as sentences", () => {
    expect(isLikelySentence("Schöne Farbe.")).toBe(true);
    expect(isLikelySentence("es kostet acht Dollar")).toBe(true); // 4 words
  });
});

describe("missingTargetCapitalization", () => {
  it("flags a lowercase German sentence", () => {
    expect(missingTargetCapitalization("es kostet acht Dollar")?.code).toBe(
      "missing_target_capitalization",
    );
  });
  it("does NOT flag single lowercase words", () => {
    expect(missingTargetCapitalization("und")).toBeNull();
    expect(missingTargetCapitalization("gut")).toBeNull();
  });
  it("does NOT flag a properly capitalized sentence", () => {
    expect(missingTargetCapitalization("Das ist gut.")).toBeNull();
  });
});

describe("missingArticleForNoun (German, conservative)", () => {
  it("does NOT flag language names, proper nouns, mass nouns, or phrases", () => {
    expect(missingArticleForNoun("le tchèque", "Tschechisch", "fr", "de")).toBeNull();
    expect(missingArticleForNoun("Prague", "Prag", "fr", "de")).toBeNull(); // no source article
    expect(missingArticleForNoun("à la maison", "zu Hause", "fr", "de")).toBeNull(); // phrase
    expect(missingArticleForNoun("l'eau", "Wasser", "fr", "de")).toBeNull(); // mass-noun exception
    expect(missingArticleForNoun("les vêtements", "Kleidung", "fr", "de")).toBeNull(); // exception
  });
  it("does NOT flag when the source has no article (no noun signal)", () => {
    expect(missingArticleForNoun("oblečení", "Kleidung", "cs", "de")).toBeNull();
  });
  it("flags a bare-noun source whose German target dropped the article", () => {
    const w = missingArticleForNoun("le corps", "Körper", "fr", "de");
    expect(w?.code).toBe("missing_article_for_noun");
  });
});

describe("parentheticalInTranslation", () => {
  it("flags a gloss added to the target when the source has none", () => {
    const w = parentheticalInTranslation("light", "luz (color)");
    expect(w?.code).toBe("parenthetical_in_translation");
    expect(w?.confidence).toBe("high");
  });
  it("flags a translated-through gloss (both sides parenthesized)", () => {
    const w = parentheticalInTranslation("English (language)", "Inglés (idioma)");
    expect(w?.code).toBe("parenthetical_in_translation");
    expect(w?.confidence).toBe("medium");
  });
  it("handles full-width brackets", () => {
    expect(parentheticalInTranslation("光", "光（色）")?.code).toBe(
      "parenthetical_in_translation",
    );
  });
  it("does NOT flag a clean plain-word translation", () => {
    expect(parentheticalInTranslation("light (color)", "luz")).toBeNull();
    expect(parentheticalInTranslation("you (informal singular)", "tú")).toBeNull();
  });
  it("does NOT flag a parenthesis preserved verbatim from the source", () => {
    expect(
      parentheticalInTranslation("Routledge (publisher)", "Routledge (publisher)"),
    ).toBeNull();
  });
});

describe("validateTranslation aggregation", () => {
  it("returns no warnings for a clean row", () => {
    expect(codes("le corps", "der Körper", "fr", "de")).toEqual([]);
    expect(codes("et", "und", "fr", "de")).toEqual([]);
  });
  it("collects a register mismatch", () => {
    expect(codes("Aidez-moi !", "Hilf mir!", "fr", "de")).toContain(
      "register_marker_mismatch",
    );
  });
});
