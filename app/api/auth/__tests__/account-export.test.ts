import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveUserFromRequest = vi.fn();
const tableRows = new Map<string, unknown[]>();
const tableReadCounts = new Map<string, number>();

function tableName(table: unknown): string {
  if (!table || typeof table !== "object") return "";
  for (const symbol of Object.getOwnPropertySymbols(table)) {
    if (symbol.toString() === "Symbol(drizzle:Name)") {
      return String((table as Record<symbol, unknown>)[symbol]);
    }
  }
  return "";
}

function rowsFor(table: unknown): unknown[] {
  const name = tableName(table);
  const count = tableReadCounts.get(name) ?? 0;
  tableReadCounts.set(name, count + 1);
  if (name === "word_lists" && count === 1) {
    return tableRows.get("subscribed_word_lists") ?? [];
  }
  return tableRows.get(name) ?? [];
}

function applySelection(rows: unknown[], selection: Record<string, unknown> | undefined) {
  if (!selection) return rows;
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(selection)) {
      picked[key] = record[key];
    }
    return picked;
  });
}

vi.mock("@/lib/auth", () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () => new Response(JSON.stringify({ error: "Authentication required" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: async () => applySelection(rowsFor(table), selection),
      }),
    }),
  },
}));

import { GET } from "../account/export/route";

function request() {
  return new NextRequest("http://localhost:3000/api/auth/account/export", {
    headers: { "x-device-id": "device-1" },
  });
}

describe("GET /api/auth/account/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableRows.clear();
    tableReadCounts.clear();
    mockResolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      deviceId: "device-1",
      userRole: "user",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });

  it("exports user data without provider secrets", async () => {
    tableRows.set("user_devices", [{ id: "device-row", userId: "user-1", deviceId: "device-1" }]);
    tableRows.set("user_progress", [{ id: "progress-1", userId: "user-1", stageIndex: 2 }]);
    tableRows.set("review_events", [{ id: "review-1", userId: "user-1", action: "known" }]);
    tableRows.set("user_memory_hooks", [{ id: "hook-1", userId: "user-1", hookText: "mnemonic" }]);
    tableRows.set("user_category_filters", [{ id: "filter-1", userId: "user-1", category: "Basics" }]);
    tableRows.set("user_list_subscriptions", [{ id: "sub-1", userId: "user-1", listId: "list-2" }]);
    tableRows.set("word_lists", [
      { id: "list-1", ownerId: "user-1", name: "My private list", shareToken: "share-secret" },
    ]);
    tableRows.set("subscribed_word_lists", [{ id: "list-2", name: "Shared list" }]);
    tableRows.set("word_categories", [{ id: "cat-1", listId: "list-1", name: "Basics" }]);
    tableRows.set("word_list_items", [{ id: "item-1", listId: "list-1", textKnown: "hello" }]);
    tableRows.set("user_api_keys", [{
      id: "key-1",
      userId: "user-1",
      provider: "openrouter",
      encryptedKey: "v1:secret",
      keyLabel: "Main key",
      status: "connected",
      lastValidatedAt: "2026-01-03T00:00:00.000Z",
      connectedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      keyLast4: "1234",
      connectionMethod: "manual",
      translationModel: "openai/gpt-4.1-mini",
      createdAt: "2026-01-01T00:00:00.000Z",
    }]);
    tableRows.set("google_api_usage", [{ id: "usage-1", userId: "user-1", units: 10 }]);
    tableRows.set("school_memberships", [{ id: "member-1", userId: "user-1", schoolId: "school-1" }]);
    tableRows.set("school_feature_usage", [{ id: "feature-1", userId: "user-1", used: 1 }]);
    tableRows.set("school_translation_requests", [{ id: "school-req-1", userId: "user-1", itemCount: 2 }]);

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Disposition")).toContain("get-word-personal-data");

    const body = await response.json();
    expect(body.format).toBe("get-word-personal-data-export-v1");
    expect(body.user.id).toBe("user-1");
    expect(body.learning.progress).toHaveLength(1);
    expect(body.lists.owned.lists).toEqual([
      { id: "list-1", ownerId: "user-1", name: "My private list" },
    ]);
    expect(body.lists.owned.items).toEqual([{ id: "item-1", listId: "list-1", textKnown: "hello" }]);
    expect(body.lists.subscribedLists).toEqual([{ id: "list-2", name: "Shared list" }]);
    expect(body.providers.connections).toEqual([
      {
        id: "key-1",
        provider: "openrouter",
        keyLabel: "Main key",
        status: "connected",
        lastValidatedAt: "2026-01-03T00:00:00.000Z",
        connectedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        keyLast4: "1234",
        connectionMethod: "manual",
        translationModel: "openai/gpt-4.1-mini",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("encryptedKey");
    expect(JSON.stringify(body)).not.toContain("v1:secret");
    expect(JSON.stringify(body)).not.toContain("shareToken");
    expect(JSON.stringify(body)).not.toContain("share-secret");
  });

  it("requires a current user", async () => {
    mockResolveUserFromRequest.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
  });
});
