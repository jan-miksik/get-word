import { describe, expect, it } from "vitest";

import {
  buildContentKeyInput,
  computeContentKey,
  isValidContentKey,
  normalizeLang,
  normalizeText,
  type ContentKeyParts,
} from "@/lib/progress-key";

const base = (over: Partial<ContentKeyParts> = {}): ContentKeyParts => ({
  languageFrom: "en",
  languageTo: "cs",
  textKnown: "hello",
  textTarget: "ahoj",
  ...over,
});

describe("normalizeLang", () => {
  it("trims and lowercases so EN→CS == en→cs", () => {
    expect(normalizeLang(" EN ")).toBe("en");
    expect(normalizeLang("Cs")).toBe("cs");
  });
});

describe("normalizeText", () => {
  it("strips one or more trailing dots and re-trims", () => {
    expect(normalizeText("hello.", { ignoreCase: false })).toBe("hello");
    expect(normalizeText("hello...", { ignoreCase: false })).toBe("hello");
    expect(normalizeText("hello .", { ignoreCase: false })).toBe("hello");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeText("a   b\tc", { ignoreCase: false })).toBe("a b c");
  });

  it("NFC-normalizes diacritics", () => {
    // "é" as e + combining accent vs precomposed é
    const decomposed = "café";
    const precomposed = "café";
    expect(normalizeText(decomposed, { ignoreCase: false })).toBe(
      normalizeText(precomposed, { ignoreCase: false }),
    );
  });

  it("only lowercases when ignoreCase is set", () => {
    expect(normalizeText("Sie", { ignoreCase: false })).toBe("Sie");
    expect(normalizeText("Sie", { ignoreCase: true })).toBe("sie");
  });
});

describe("computeContentKey — format & determinism", () => {
  it("returns a valid v1 key", async () => {
    const key = await computeContentKey(base());
    expect(key).not.toBeNull();
    expect(isValidContentKey(key)).toBe(true);
    expect(key).toMatch(/^v1:[a-f0-9]{64}$/);
  });

  it("matches a fixed cross-environment fixture (guards UTF-8/encoding drift)", async () => {
    // SHA-256 of '["en","cs","hello","ahoj"]' — identical in any standards-
    // compliant SHA-256 (Node, Web Crypto, browser).
    const key = await computeContentKey(
      base({ textKnown: "hello", textTarget: "ahoj" }),
    );
    expect(key).toBe(
      "v1:663515b65c2ddac38730a9a08f3cce21cf42e16ebef423b9a4bc35c39a51064c",
    );
  });

  it("is stable across calls", async () => {
    expect(await computeContentKey(base())).toBe(await computeContentKey(base()));
  });
});

describe("computeContentKey — case sensitivity", () => {
  it("is case-sensitive by default: Sie vs sie differ", async () => {
    const a = await computeContentKey(base({ textKnown: "Sie", textTarget: "ona" }));
    const b = await computeContentKey(base({ textKnown: "sie", textTarget: "ona" }));
    expect(a).not.toBe(b);
  });

  it("US vs us differ by default", async () => {
    const a = await computeContentKey(base({ textKnown: "US", textTarget: "USA" }));
    const b = await computeContentKey(base({ textKnown: "us", textTarget: "USA" }));
    expect(a).not.toBe(b);
  });

  it("ignoreCase makes US and us share (flag not part of the key)", async () => {
    const a = await computeContentKey(
      base({ textKnown: "US", textTarget: "usa", ignoreCase: true }),
    );
    const b = await computeContentKey(
      base({ textKnown: "us", textTarget: "usa", ignoreCase: false }),
    );
    // a lowercases to us/usa; b is already us/usa → same final text → same key.
    expect(a).toBe(b);
  });
});

describe("computeContentKey — full pair identity", () => {
  it("US→USA and us→nás stay different even with ignoreCase (target differs)", async () => {
    const a = await computeContentKey(
      base({ textKnown: "US", textTarget: "USA", ignoreCase: true }),
    );
    const b = await computeContentKey(
      base({ textKnown: "us", textTarget: "nás", ignoreCase: true }),
    );
    expect(a).not.toBe(b);
  });

  it("US→USA and us→usa merge with ignoreCase (whole pair matches)", async () => {
    const a = await computeContentKey(
      base({ textKnown: "US", textTarget: "USA", ignoreCase: true }),
    );
    const b = await computeContentKey(
      base({ textKnown: "us", textTarget: "usa", ignoreCase: true }),
    );
    expect(a).toBe(b);
  });

  it("'hello .' and 'hello' produce the same key", async () => {
    const a = await computeContentKey(base({ textKnown: "hello ." }));
    const b = await computeContentKey(base({ textKnown: "hello" }));
    expect(a).toBe(b);
  });

  it("EN→CS equals en→cs (language case-folding)", async () => {
    const a = await computeContentKey(base({ languageFrom: "EN", languageTo: "CS" }));
    const b = await computeContentKey(base({ languageFrom: "en", languageTo: "cs" }));
    expect(a).toBe(b);
  });

  it("reversed direction does NOT share", async () => {
    const a = await computeContentKey(base({ languageFrom: "en", languageTo: "cs" }));
    const b = await computeContentKey(base({ languageFrom: "cs", languageTo: "en" }));
    expect(a).not.toBe(b);
  });

  it("different language pair does NOT share", async () => {
    const a = await computeContentKey(base({ languageTo: "cs" }));
    const b = await computeContentKey(base({ languageTo: "de" }));
    expect(a).not.toBe(b);
  });
});

describe("null-key short-circuit", () => {
  it("empty target yields null (no content key)", async () => {
    expect(buildContentKeyInput(base({ textTarget: "" }))).toBeNull();
    expect(await computeContentKey(base({ textTarget: "" }))).toBeNull();
    expect(await computeContentKey(base({ textTarget: null }))).toBeNull();
  });

  it("empty/whitespace known yields null", async () => {
    expect(await computeContentKey(base({ textKnown: "   " }))).toBeNull();
    expect(await computeContentKey(base({ textKnown: "" }))).toBeNull();
  });
});

describe("isValidContentKey", () => {
  it("accepts a v1 hex key and rejects others", () => {
    expect(isValidContentKey("v1:" + "a".repeat(64))).toBe(true);
    expect(isValidContentKey("v1:" + "A".repeat(64))).toBe(false); // uppercase hex
    expect(isValidContentKey("v2:" + "a".repeat(64))).toBe(false);
    expect(isValidContentKey("v1:abc")).toBe(false);
    expect(isValidContentKey(null)).toBe(false);
    expect(isValidContentKey(123)).toBe(false);
  });
});
