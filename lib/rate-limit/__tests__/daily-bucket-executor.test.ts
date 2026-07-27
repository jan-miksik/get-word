import { describe, expect, it, vi } from "vitest";

/**
 * The word-chat commit reserves its monthly item quota inside the SAME
 * transaction that saves the items. If `reserveDailyBuckets` ignored the passed
 * executor and opened its own transaction, a crash after the reservation would
 * leave a charged quota with nothing saved — the exact failure the atomic commit
 * exists to prevent.
 */
const transactionSpy = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (callback: (tx: unknown) => unknown) => {
      transactionSpy();
      return callback({ execute: () => Promise.resolve([{ request_count: 1 }]) });
    },
  },
}));

import { DailyLimitError, reserveDailyBuckets } from "../daily-bucket";

function executorStub(rows: unknown[]) {
  return { execute: vi.fn().mockResolvedValue(rows) } as never;
}

describe("reserveDailyBuckets", () => {
  it("joins the caller's transaction instead of opening its own", async () => {
    transactionSpy.mockClear();
    const executor = executorStub([{ request_count: 3 }]);

    await reserveDailyBuckets(
      [{ key: "word_chat:items:user:u1", limit: 60, count: 10, period: "month", message: "over" }],
      executor,
    );

    expect(transactionSpy).not.toHaveBeenCalled();
    expect((executor as unknown as { execute: ReturnType<typeof vi.fn> }).execute)
      .toHaveBeenCalledTimes(1);
  });

  it("opens its own transaction when no executor is given", async () => {
    transactionSpy.mockClear();

    await reserveDailyBuckets([
      { key: "word_chat:turns:global", limit: 1000, message: "busy" },
    ]);

    expect(transactionSpy).toHaveBeenCalledTimes(1);
  });

  it("throws so the caller's transaction rolls back when the bucket is full", async () => {
    // An empty RETURNING means the conditional UPDATE matched nothing: over
    // limit. Inside a commit this must abort everything, not just skip.
    const executor = executorStub([]);

    await expect(
      reserveDailyBuckets(
        [{ key: "word_chat:items:user:u1", limit: 60, count: 10, period: "month", message: "over" }],
        executor,
      ),
    ).rejects.toBeInstanceOf(DailyLimitError);
  });

  it("rejects a reservation larger than the whole limit before touching the database", async () => {
    const executor = executorStub([{ request_count: 1 }]);

    await expect(
      reserveDailyBuckets(
        [{ key: "word_chat:items:user:u1", limit: 60, count: 90, period: "month", message: "over" }],
        executor,
      ),
    ).rejects.toBeInstanceOf(DailyLimitError);
    expect((executor as unknown as { execute: ReturnType<typeof vi.fn> }).execute)
      .not.toHaveBeenCalled();
  });
});
