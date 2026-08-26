import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExistingTranslationMatches: vi.fn(),
  loadCorpusItems: vi.fn(),
  openRouterTranslate: vi.fn(),
  reserveDailyBuckets: vi.fn(),
  getMonthlyItemUsage: vi.fn(),
  recordWordChatUsage: vi.fn(),
  runReservedWordChatCall: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  findExistingTranslationMatches: mocks.findExistingTranslationMatches,
}));
vi.mock("../server/corpus", () => ({ loadCorpusItems: mocks.loadCorpusItems }));
vi.mock("@/lib/translation", () => ({ openRouterTranslate: mocks.openRouterTranslate }));
vi.mock("@/lib/openrouter-chat", () => ({
  OpenRouterChatError: class OpenRouterChatError extends Error {
    isOutOfCredits = false;
  },
}));
vi.mock("@/lib/rate-limit/daily-bucket", () => ({
  DailyLimitError: class DailyLimitError extends Error {
    readonly code = "DAILY_LIMIT_REACHED";
  },
  parsePositiveIntEnv: (value: string | undefined, fallback: number) =>
    value ? Number(value) : fallback,
  reserveDailyBuckets: mocks.reserveDailyBuckets,
}));
vi.mock("../server/rate-limit", () => ({ getMonthlyItemUsage: mocks.getMonthlyItemUsage }));
vi.mock("../server/usage", () => ({
  recordWordChatUsage: mocks.recordWordChatUsage,
  runReservedWordChatCall: mocks.runReservedWordChatCall,
}));
import { translateSelection } from "../server/translate";

function modelReturns(results: unknown[]) {
  mocks.runReservedWordChatCall.mockResolvedValue({
    result: results,
    reservation: { commit: vi.fn(), release: vi.fn() },
    meta: {},
    responseCount: results.length,
    usageObserved: true,
    minimumCostUsd: 0,
  });
}

async function translate(languageTo: string, text: string) {
  return translateSelection({
    userId: "u1",
    role: "user",
    sessionId: "s1",
    languageFrom: "en",
    languageTo,
    items: [{ kind: "sentence", text }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_SERVER_API_KEY = "test-key";
  mocks.loadCorpusItems.mockResolvedValue(new Map());
  mocks.findExistingTranslationMatches.mockResolvedValue([]);
  mocks.getMonthlyItemUsage.mockResolvedValue({
    used: 0,
    limit: 60,
    resetAt: new Date("2026-09-01T00:00:00.000Z"),
  });
});

describe("translateSelection address forms", () => {
  it("enables address-form prompting and parsing on the real model call", async () => {
    mocks.openRouterTranslate.mockResolvedValue([
      {
        text: "How are you?",
        translated: "Wie geht es dir?",
        status: "ok",
        register: "familiar",
      },
    ]);
    mocks.runReservedWordChatCall.mockImplementation(
      async (_reservation: unknown, call: (handlers: {
        onResponse: () => void;
        onAttemptStart: () => void;
      }) => Promise<unknown>) => ({
        result: await call({ onResponse: vi.fn(), onAttemptStart: vi.fn() }),
        reservation: { commit: vi.fn(), release: vi.fn() },
        meta: {},
        responseCount: 1,
        usageObserved: false,
        minimumCostUsd: 0,
      }),
    );

    await translate("de", "How are you?");

    expect(mocks.openRouterTranslate).toHaveBeenCalledWith(
      ["How are you?"],
      "en",
      "de",
      "test-key",
      expect.any(String),
      undefined,
      expect.objectContaining({ addressForms: true }),
    );
  });

  it("carries a model-offered pair through as one row plus its alternative", async () => {
    modelReturns([
      {
        text: "How are you?",
        translated: "Wie geht es dir?",
        status: "ok",
        register: "familiar",
        alternative: { translated: "Wie geht es Ihnen?", register: "polite" },
      },
    ]);

    const { rows } = await translate("de", "How are you?");

    expect(rows).toHaveLength(1);
    expect(rows[0].addressForm).toEqual({ form: "familiar" });
    expect(rows[0].addressAlternative).toEqual({
      textTarget: "Wie geht es Ihnen?",
      form: "polite",
    });
  });

  it("ignores address forms entirely for a target without a binary system", async () => {
    // Vietnamese picks its pronoun from the relationship, so a familiar/polite
    // pair would be an invention. The rules never even reach the prompt.
    modelReturns([
      {
        text: "How are you?",
        translated: "Bạn khỏe không?",
        status: "ok",
        register: "familiar",
        alternative: { translated: "Anh khỏe không?", register: "polite" },
      },
    ]);

    const { rows } = await translate("vi", "How are you?");

    expect(rows[0].addressForm).toBeUndefined();
    expect(rows[0].addressAlternative).toBeUndefined();
  });

  it("reuses a complete stored pair as a pair", async () => {
    mocks.findExistingTranslationMatches.mockResolvedValue([
      {
        text: "How are you?",
        translatedText: "Wie geht es dir?",
        addressForm: "familiar",
        alternative: { translatedText: "Wie geht es Ihnen?", addressForm: "polite" },
      },
    ]);

    const { rows } = await translate("de", "How are you?");

    expect(rows[0].reused).toBe(true);
    expect(rows[0].addressForm).toEqual({ form: "familiar" });
    expect(rows[0].addressAlternative).toEqual({
      textTarget: "Wie geht es Ihnen?",
      form: "polite",
    });
    expect(mocks.runReservedWordChatCall).not.toHaveBeenCalled();
  });

  it("reuses a lone stored row without inventing a twin for it", async () => {
    mocks.findExistingTranslationMatches.mockResolvedValue([
      { text: "How are you?", translatedText: "Wie geht es dir?", addressForm: "familiar" },
    ]);

    const { rows } = await translate("de", "How are you?");

    expect(rows[0].addressForm).toEqual({ form: "familiar" });
    expect(rows[0].addressAlternative).toBeUndefined();
  });

  it("never generates an alternative for a hand-picked corpus row", async () => {
    // The learner chose this exact published pair. Adding a twin would save a
    // word they never asked for.
    mocks.loadCorpusItems.mockResolvedValue(
      new Map([
        [
          "corpus-1",
          {
            id: "corpus-1",
            textKnown: "How are you?",
            textTarget: "Wie geht es Ihnen?",
            audioAssetId: null,
            audioHash: null,
            knownAudioAssetId: null,
            listId: "l1",
            listName: "L",
            languageFrom: "en",
            languageTo: "de",
            ignoreCase: false,
            acceptedKnown: [],
            acceptedTarget: [],
            notes: null,
            comment: null,
            addressForm: { version: 1, form: "polite", groupId: "g1" },
          },
        ],
      ]),
    );

    const { rows } = await translateSelection({
      userId: "u1",
      role: "user",
      sessionId: "s1",
      languageFrom: "en",
      languageTo: "de",
      items: [{ kind: "sentence", text: "How are you?", corpusItemId: "corpus-1" }],
    });

    expect(rows[0].addressForm).toEqual({ form: "polite" });
    expect(rows[0].addressAlternative).toBeUndefined();
  });
});
