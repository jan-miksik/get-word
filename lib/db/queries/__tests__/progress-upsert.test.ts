import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

import {
  batchUpsertProgress,
  batchUpsertProgressByContentKey,
} from "@/lib/db/queries/progress";

function makeExecutor() {
  let conflictConfig: { set: Record<string, unknown> } | undefined;
  const onConflictDoUpdate = vi.fn(async (config: { set: Record<string, unknown> }) => {
    conflictConfig = config;
  });
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return {
    executor: { insert },
    onConflictDoUpdate,
    getConflictConfig: () => conflictConfig,
  };
}

const progressRow = {
  userId: "user-1",
  wordId: "legacy-word-1",
  wordListItemId: "item-1",
  contentKey: "v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  stageIndex: 2,
  knownCount: 3,
  unknownCount: 1,
  lastKnownAt: new Date("2026-01-01T00:00:00.000Z"),
  lastUnknownAt: null,
  nextDueAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("progress upserts", () => {
  it("unarchives content-key progress rows when a newer write conflicts", async () => {
    const { executor, onConflictDoUpdate, getConflictConfig } = makeExecutor();

    await batchUpsertProgressByContentKey([progressRow], executor as never);

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(getConflictConfig()?.set.archivedAt).toBeNull();
  });

  it("unarchives legacy progress rows when a newer write conflicts", async () => {
    const { executor, onConflictDoUpdate, getConflictConfig } = makeExecutor();

    await batchUpsertProgress([progressRow], executor as never);

    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(getConflictConfig()?.set.archivedAt).toBeNull();
  });
});
