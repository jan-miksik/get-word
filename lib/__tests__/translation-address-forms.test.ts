import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ callOpenRouterChatParsedWithMeta: vi.fn() }));

// Only the network call is replaced; the real `parseJsonLoose` and error class
// stay, so this exercises the actual parsing path.
vi.mock("@/lib/openrouter-chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/openrouter-chat")>()),
  callOpenRouterChatParsedWithMeta: mocks.callOpenRouterChatParsedWithMeta,
}));

// Pulled in transitively by lib/translation.ts for BYOK secrets; the address-form
// parsing under test never reaches it.
vi.mock("@/lib/providers/store", () => ({ getProviderSecret: vi.fn() }));

import { openRouterTranslate } from "@/lib/translation";

/** Feed one canned model response through the real parser. */
function respondWith(items: unknown[]) {
  mocks.callOpenRouterChatParsedWithMeta.mockImplementation(
    async (_request: unknown, parse: (content: string) => unknown) => ({
      value: parse(JSON.stringify({ items })),
      meta: {},
    }),
  );
}

async function translate(texts: string[], addressForms = true) {
  return openRouterTranslate(texts, "en", "de", "key", "test-model", undefined, {
    addressForms,
  });
}

beforeEach(() => {
  mocks.callOpenRouterChatParsedWithMeta.mockReset();
});

describe("address forms in the translation response", () => {
  it("reads a form and its alternative when the source left the choice open", async () => {
    respondWith([
      {
        index: 1,
        translated: "Wie geht es dir?",
        register: "familiar",
        alternative: { translated: "Wie geht es Ihnen?", register: "polite" },
      },
    ]);

    const [result] = await translate(["How are you?"]);

    expect(result.translated).toBe("Wie geht es dir?");
    expect(result.register).toBe("familiar");
    expect(result.alternative).toEqual({
      translated: "Wie geht es Ihnen?",
      register: "polite",
    });
  });

  it("reads a form with no alternative when the source already fixed it", async () => {
    // The independence that matters: reporting the form and creating a second
    // item are different answers, so this must NOT become a pair.
    respondWith([{ index: 1, translated: "Wie geht es Ihnen?", register: "polite" }]);

    const [result] = await translate(["How are you (polite)?"]);

    expect(result.register).toBe("polite");
    expect(result.alternative).toBeUndefined();
  });

  it("leaves both off for an item with no addressee", async () => {
    respondWith([{ index: 1, translated: "Brot" }]);

    const [result] = await translate(["bread"]);

    expect(result.translated).toBe("Brot");
    expect(result.register).toBeUndefined();
    expect(result.alternative).toBeUndefined();
  });

  it("ignores the fields entirely for a target without a binary system", async () => {
    respondWith([
      {
        index: 1,
        translated: "Bạn khỏe không?",
        register: "familiar",
        alternative: { translated: "Anh khỏe không?", register: "polite" },
      },
    ]);

    const [result] = await openRouterTranslate(
      ["How are you?"],
      "en",
      "vi",
      "key",
      "test-model",
      undefined,
      { addressForms: false },
    );

    expect(result.translated).toBe("Bạn khỏe không?");
    expect(result.register).toBeUndefined();
    expect(result.alternative).toBeUndefined();
  });

  describe("a bad alternative is dropped, never the translation", () => {
    const cases: [string, unknown][] = [
      ["same register on both sides", { translated: "Wie geht es Ihnen?", register: "familiar" }],
      ["an unknown register", { translated: "Wie geht es Ihnen?", register: "formal" }],
      ["no register at all", { translated: "Wie geht es Ihnen?" }],
      ["empty text", { translated: "   ", register: "polite" }],
      ["identical wording", { translated: "wie geht es dir?", register: "polite" }],
      ["not an object", "Wie geht es Ihnen?"],
    ];

    it.each(cases)("%s", async (_name, alternative) => {
      respondWith([
        { index: 1, translated: "Wie geht es dir?", register: "familiar", alternative },
      ]);

      const [result] = await translate(["How are you?"]);

      expect(result.status).toBe("ok");
      expect(result.translated).toBe("Wie geht es dir?");
      expect(result.register).toBe("familiar");
      expect(result.alternative).toBeUndefined();
    });
  });

  it("drops the alternative when the row's own register is unusable", async () => {
    respondWith([
      {
        index: 1,
        translated: "Wie geht es dir?",
        register: "casual",
        alternative: { translated: "Wie geht es Ihnen?", register: "polite" },
      },
    ]);

    const [result] = await translate(["How are you?"]);

    expect(result.translated).toBe("Wie geht es dir?");
    expect(result.register).toBeUndefined();
    expect(result.alternative).toBeUndefined();
  });
});
