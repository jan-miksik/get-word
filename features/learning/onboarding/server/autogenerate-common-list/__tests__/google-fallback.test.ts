import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGoogleTranslate = vi.fn();

vi.mock("@/lib/translation", () => ({
  googleTranslate: (...args: unknown[]) => mockGoogleTranslate(...args),
}));

import { generateFromGoogleTranslateSeed } from "../google-fallback";

describe("generateFromGoogleTranslateSeed", () => {
  beforeEach(() => {
    mockGoogleTranslate.mockReset();
  });

  it("keeps the source side and translates the missing side", async () => {
    mockGoogleTranslate.mockResolvedValueOnce([
      { text: "hello", translated: "ahoj", status: "ok" },
      { text: "thank you", translated: "dekuji", status: "ok" },
    ]);

    const result = await generateFromGoogleTranslateSeed({
      userId: "user-1",
      languageFrom: "en",
      languageTo: "cs",
      sourceLanguage: "en",
      sourceItems: [
        { sourceIndex: 0, source: "hello", category: "Greetings" },
        { sourceIndex: 1, source: "thank you", category: "Phrases" },
      ],
    });

    expect(mockGoogleTranslate).toHaveBeenCalledWith(
      ["hello", "thank you"],
      "en",
      "cs",
      { source: "common_list_autogenerate", userId: "user-1" },
    );
    expect(result).toEqual([
      { sourceIndex: 0, known: "hello", target: "ahoj", category: "Greetings" },
      { sourceIndex: 1, known: "thank you", target: "dekuji", category: "Phrases" },
    ]);
  });

  it("translates both sides when the seed source is a third language", async () => {
    mockGoogleTranslate
      .mockResolvedValueOnce([
        { text: "hallo", translated: "hello", status: "ok" },
      ])
      .mockResolvedValueOnce([
        { text: "hallo", translated: "ahoj", status: "ok" },
      ]);

    const result = await generateFromGoogleTranslateSeed({
      userId: "user-1",
      languageFrom: "en",
      languageTo: "cs",
      sourceLanguage: "de",
      sourceItems: [{ sourceIndex: 2, source: "hallo", category: "" }],
    });

    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(
      1,
      ["hallo"],
      "de",
      "en",
      { source: "common_list_autogenerate", userId: "user-1" },
    );
    expect(mockGoogleTranslate).toHaveBeenNthCalledWith(
      2,
      ["hallo"],
      "de",
      "cs",
      { source: "common_list_autogenerate", userId: "user-1" },
    );
    expect(result).toEqual([
      { sourceIndex: 2, known: "hello", target: "ahoj", category: "Common" },
    ]);
  });

  it("drops rows when either side cannot be translated", async () => {
    mockGoogleTranslate.mockResolvedValueOnce([
      { text: "hello", translated: null, status: "error" },
    ]);

    const result = await generateFromGoogleTranslateSeed({
      userId: "user-1",
      languageFrom: "en",
      languageTo: "cs",
      sourceLanguage: "en",
      sourceItems: [{ sourceIndex: 0, source: "hello", category: "Greetings" }],
    });

    expect(result).toEqual([]);
  });
});
