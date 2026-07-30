import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExistingTranslations: vi.fn(),
  openRouterTranslate: vi.fn(),
  reserveDailyBuckets: vi.fn(),
  getMonthlyItemUsage: vi.fn(),
  recordWordChatUsage: vi.fn(),
  runReservedWordChatCall: vi.fn(
    async (
      _input: unknown,
      run: (hooks: {
        onResponse: (meta: unknown) => void;
        onAttemptStart: () => void;
      }) => Promise<unknown>,
    ) => ({
      result: await run({
        onResponse: () => undefined,
        onAttemptStart: () => undefined,
      }),
      reservation: {
        id: "reservation-1",
        model: "test/model",
        reservedUsd: 0.1,
        maxAttempts: 3,
      },
      meta: {},
      responseCount: 1,
      usageObserved: false,
      minimumCostUsd: 0,
    }),
  ),
}));

vi.mock("@/lib/db", () => ({
  findExistingTranslations: mocks.findExistingTranslations,
}));

vi.mock("@/lib/openrouter-chat", () => ({
  OpenRouterChatError: class OpenRouterChatError extends Error {
    isOutOfCredits = false;
  },
}));

vi.mock("@/lib/translation", () => ({
  openRouterTranslate: mocks.openRouterTranslate,
}));

vi.mock("@/lib/rate-limit/daily-bucket", () => ({
  DailyLimitError: class DailyLimitError extends Error {
    readonly code = "DAILY_LIMIT_REACHED";
  },
  parsePositiveIntEnv: (value: string | undefined, fallback: number) =>
    value ? Number(value) : fallback,
  reserveDailyBuckets: mocks.reserveDailyBuckets,
}));

vi.mock("../server/rate-limit", () => ({
  getMonthlyItemUsage: mocks.getMonthlyItemUsage,
}));

vi.mock("../server/corpus", () => ({
  loadCorpusItems: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../server/usage", () => ({
  recordWordChatUsage: mocks.recordWordChatUsage,
  runReservedWordChatCall: mocks.runReservedWordChatCall,
}));

import { translateSelection } from "../server/translate";

describe("translateSelection monthly item quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_SERVER_API_KEY = "test-key";
    mocks.getMonthlyItemUsage.mockResolvedValue({
      used: 58,
      limit: 60,
      resetAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.findExistingTranslations.mockResolvedValue([]);
  });

  it("rejects before paid translation work when the selection exceeds remaining monthly items", async () => {
    await expect(
      translateSelection({
        userId: "user-1",
        role: "user",
        sessionId: "session-1",
        languageFrom: "cs",
        languageTo: "vi",
        items: [
          { kind: "word", text: "jedna" },
          { kind: "word", text: "dva" },
          { kind: "word", text: "tři" },
        ],
      }),
    ).rejects.toMatchObject({ code: "DAILY_LIMIT_REACHED" });

    expect(mocks.reserveDailyBuckets).not.toHaveBeenCalled();
    expect(mocks.findExistingTranslations).not.toHaveBeenCalled();
    expect(mocks.openRouterTranslate).not.toHaveBeenCalled();
  });

  it("does not reserve or record a model call when every translation is reused", async () => {
    mocks.getMonthlyItemUsage.mockResolvedValue({
      used: 0,
      limit: 60,
      resetAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    mocks.findExistingTranslations.mockResolvedValue([
      { text: "káva", translatedText: "cà phê" },
    ]);

    const result = await translateSelection({
      userId: "user-1",
      role: "user",
      sessionId: "session-1",
      languageFrom: "cs",
      languageTo: "vi",
      items: [{ kind: "word", text: "káva" }],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        textKnown: "káva",
        textTarget: "cà phê",
        reused: true,
      }),
    ]);
    expect(mocks.runReservedWordChatCall).not.toHaveBeenCalled();
    expect(mocks.openRouterTranslate).not.toHaveBeenCalled();
    expect(mocks.recordWordChatUsage).not.toHaveBeenCalled();
  });
});
