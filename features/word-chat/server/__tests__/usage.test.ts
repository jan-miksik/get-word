import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecute = vi.fn();
const mockTxExecute = vi.fn();
const mockReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockReturning }));
const mockWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockWhere }));
const mockTransaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) =>
  run({
    execute: (...args: unknown[]) => mockTxExecute(...args),
    insert: () => ({ values: mockInsertValues }),
  }),
);

vi.mock("@/lib/db/client", () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    transaction: (run: (tx: unknown) => Promise<unknown>) =>
      mockTransaction(run),
    insert: () => ({ values: mockInsertValues }),
    update: () => ({ set: mockUpdateSet }),
  },
}));

vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    WORD_CHAT_MONTHLY_SPEND_LIMIT_USD: 2,
  };
});

import {
  assertWordChatSpendAvailable,
  getMonthlyWordChatSpend,
  recordWordChatUsage,
  reserveWordChatSpend,
  runReservedWordChatCall,
  WordChatSpendLimitError,
} from "../usage";

describe("Word Chat monthly spend", () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockTxExecute.mockReset();
    mockReturning.mockReset();
    mockInsertValues.mockClear();
    mockWhere.mockReset();
    mockUpdateSet.mockClear();
    mockTransaction.mockClear();
  });

  it("reads the estimated spend for the UTC calendar month", async () => {
    mockExecute.mockResolvedValueOnce([{ used_usd: "1.234567" }]);

    await expect(
      getMonthlyWordChatSpend(
        "user-1",
        new Date("2026-07-30T23:59:00.000Z"),
      ),
    ).resolves.toEqual({
      usedUsd: 1.234567,
      limitUsd: 2,
      resetAt: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("allows another paid call while spend is below the limit", async () => {
    mockExecute.mockResolvedValueOnce([{ used_usd: "1.999999" }]);

    await expect(
      assertWordChatSpendAvailable(
        "user-1",
        new Date("2026-07-30T12:00:00.000Z"),
      ),
    ).resolves.toBeUndefined();
  });

  it("blocks paid calls once the monthly limit is reached", async () => {
    mockExecute.mockResolvedValueOnce([{ used_usd: "2.000000" }]);

    await expect(
      assertWordChatSpendAvailable(
        "user-1",
        new Date("2026-07-30T12:00:00.000Z"),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "WORD_CHAT_MONTHLY_SPEND_LIMIT",
        usedUsd: 2,
        limitUsd: 2,
        resetAt: new Date("2026-08-01T00:00:00.000Z"),
      }),
    );
  });

  it("exposes a stable error type for the API mapper", () => {
    expect(
      new WordChatSpendLimitError(
        2.1,
        2,
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).toMatchObject({
      name: "WordChatSpendLimitError",
      code: "WORD_CHAT_MONTHLY_SPEND_LIMIT",
    });
  });

  it("serializes and inserts a conservative monthly reservation", async () => {
    mockTxExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_usd: "0.25" }]);
    mockReturning.mockResolvedValueOnce([{ id: "reservation-1" }]);

    await expect(
      reserveWordChatSpend({
        userId: "user-1",
        sessionId: "session-1",
        callType: "chat",
        stage: "started",
        model: "anthropic/claude-sonnet-5",
        request: { messages: [{ role: "user", content: "hello" }] },
        maxOutputTokens: 2_000,
        maxAttempts: 3,
        date: new Date("2026-07-30T12:00:00.000Z"),
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "reservation-1",
        model: "anthropic/claude-sonnet-5",
        reservedUsd: expect.any(Number),
      }),
    );

    expect(mockTxExecute).toHaveBeenCalledTimes(2);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "__reserved__:anthropic/claude-sonnet-5",
      }),
    );
  });

  it("rejects atomically when the reservation would cross the limit", async () => {
    mockTxExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_usd: "1.99" }]);

    await expect(
      reserveWordChatSpend({
        userId: "user-1",
        sessionId: "session-1",
        callType: "proposal",
        stage: "proposal_completed",
        model: "anthropic/claude-opus-5",
        request: { messages: [{ role: "user", content: "hello" }] },
        maxOutputTokens: 4_000,
        maxAttempts: 3,
        date: new Date("2026-07-30T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      code: "WORD_CHAT_MONTHLY_SPEND_LIMIT",
      usedUsd: 1.99,
    });

    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("finalizes an existing reservation instead of inserting a second row", async () => {
    mockWhere.mockResolvedValueOnce([]);

    await recordWordChatUsage({
      userId: "user-1",
      sessionId: "session-1",
      callType: "chat",
      stage: "started",
      model: "anthropic/claude-sonnet-5",
      meta: {
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
      reservation: {
        id: "reservation-1",
        model: "anthropic/claude-sonnet-5",
        reservedUsd: 0.1,
        maxAttempts: 3,
      },
    });

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-sonnet-5",
        inputTokens: 100,
        outputTokens: 50,
      }),
    );
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("charges observed usage when a paid response later fails parsing", async () => {
    mockTxExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ used_usd: "0.25" }]);
    mockReturning.mockResolvedValueOnce([{ id: "reservation-1" }]);
    mockWhere.mockResolvedValueOnce([]);

    await expect(
      runReservedWordChatCall(
        {
          userId: "user-1",
          sessionId: "session-1",
          callType: "proposal",
          stage: "proposal_completed",
          model: "anthropic/claude-sonnet-5",
          request: { messages: [{ role: "user", content: "hello" }] },
          maxOutputTokens: 4_000,
          maxAttempts: 3,
          date: new Date("2026-07-30T12:00:00.000Z"),
        },
        async ({ onResponse, onAttemptStart }) => {
          onAttemptStart();
          onResponse({
            usage: { prompt_tokens: 1_000, completion_tokens: 500 },
          });
          throw new Error("Malformed response");
        },
      ),
    ).rejects.toThrow("Malformed response");

    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 1_000,
        outputTokens: 500,
      }),
    );
  });
});
