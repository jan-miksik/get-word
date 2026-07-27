import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findExistingTranslations: vi.fn(),
  openRouterTranslate: vi.fn(),
  reserveDailyBuckets: vi.fn(),
  getMonthlyItemUsage: vi.fn(),
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
  recordWordChatUsage: vi.fn(),
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
});
