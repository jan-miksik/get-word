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

type ConflictConfig = { set: Record<string, unknown>; setWhere?: unknown };

function makeExecutor() {
  let conflictConfig: ConflictConfig | undefined;
  const onConflictDoUpdate = vi.fn(async (config: ConflictConfig) => {
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

  it("overwrites unconditionally by default (no LWW guard)", async () => {
    const { executor, getConflictConfig } = makeExecutor();

    await batchUpsertProgress([progressRow], executor as never);

    const config = getConflictConfig();
    expect(config?.setWhere).toBeUndefined();
    expect(config?.set.updatedAt).toBeInstanceOf(Date);
  });

  it("guards client LWW writes and stamps the client's updatedAt", async () => {
    const { executor, getConflictConfig } = makeExecutor();

    await batchUpsertProgress([progressRow], executor as never, { lww: true });

    const config = getConflictConfig();
    expect(config?.setWhere).toBeDefined();
    // LWW stores the client's own timestamp, so `updatedAt` is `excluded.*`
    // SQL rather than a server-clock Date.
    expect(config?.set.updatedAt).not.toBeInstanceOf(Date);
  });

  it("guards event folds against reverting a newer write but keeps a server updatedAt", async () => {
    const { executor, getConflictConfig } = makeExecutor();

    await batchUpsertProgressByContentKey([progressRow], executor as never, {
      eventOccurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const config = getConflictConfig();
    // A stale event must be skippable via setWhere...
    expect(config?.setWhere).toBeDefined();
    // ...yet an applied fold still bumps updatedAt to the server clock so the
    // delta cursor surfaces it to other devices.
    expect(config?.set.updatedAt).toBeInstanceOf(Date);
  });
});
