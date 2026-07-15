import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveUserFromRequest = vi.fn();
const mockGetListById = vi.fn();
const mockUpdateItemTranslations = vi.fn();
const mockGetUserApiKey = vi.fn();
const mockCallOpenRouterChatParsed = vi.fn();
const mockDbWhere = vi.fn();

vi.mock("@/lib/auth", () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  forbiddenResponse: (message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/db", () => ({
  getListById: (...args: unknown[]) => mockGetListById(...args),
  updateItemTranslations: (...args: unknown[]) => mockUpdateItemTranslations(...args),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => mockDbWhere(...args),
      }),
    }),
  },
}));

vi.mock("@/lib/translation", () => ({
  getUserApiKey: (...args: unknown[]) => mockGetUserApiKey(...args),
}));

vi.mock("@/lib/openrouter-chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/openrouter-chat")>();
  return {
    ...original,
    callOpenRouterChatParsed: (...args: unknown[]) => mockCallOpenRouterChatParsed(...args),
  };
});

import { POST as bulkSuggest } from "../[id]/accepted-answers/bulk-suggest/route";
import { POST as bulkApply } from "../[id]/accepted-answers/bulk-apply/route";
import { OpenRouterChatError } from "@/lib/openrouter-chat";
import {
  BULK_ACCEPTED_ANSWERS_CHUNK_SIZE,
  MAX_ACCEPTED_ANSWERS,
} from "@/lib/word-item-accepted-answers";

const testUser = { id: "user-1", deviceId: "dev-1", userRole: "user" };
const testList = {
  id: "list-1",
  ownerId: "user-1",
  name: "My List",
  languageFrom: "cz",
  languageTo: "en",
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type Item = {
  id: string;
  listId: string;
  textKnown: string;
  textTarget: string | null;
  acceptedKnown: string[];
  acceptedTarget: string[];
  comment: null;
};

const makeItem = (id: string, extras?: Partial<Item>): Item => ({
  id,
  listId: "list-1",
  textKnown: "dobrý",
  textTarget: "vodka",
  acceptedKnown: [],
  acceptedTarget: [],
  comment: null,
  ...extras,
});

function makeCtx(id = "list-1") {
  return { params: Promise.resolve({ id }) };
}

function suggestRequest(body: unknown) {
  return new NextRequest("http://localhost/api/lists/list-1/accepted-answers/bulk-suggest", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function applyRequest(body: unknown) {
  return new NextRequest("http://localhost/api/lists/list-1/accepted-answers/bulk-apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Runs the route's parse callback against a canned LLM response so index
// handling is exercised for real.
function mockLlmResponse(payload: unknown) {
  mockCallOpenRouterChatParsed.mockImplementation(
    async (_options: unknown, parse: (content: string) => unknown) =>
      parse(JSON.stringify(payload)),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveUserFromRequest.mockResolvedValue(testUser);
  mockGetListById.mockResolvedValue(testList);
  mockGetUserApiKey.mockResolvedValue("or-key");
  mockUpdateItemTranslations.mockResolvedValue(undefined);
  mockDbWhere.mockResolvedValue([]);
});

describe("POST /api/lists/[id]/accepted-answers/bulk-suggest", () => {
  it("returns 401 without a user", async () => {
    mockResolveUserFromRequest.mockResolvedValue(null);
    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-owners", async () => {
    mockGetListById.mockResolvedValue({ ...testList, ownerId: "someone-else" });
    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());
    expect(res.status).toBe(403);
  });

  it("returns 400 without item_ids", async () => {
    const res = await bulkSuggest(suggestRequest({}), makeCtx());
    expect(res.status).toBe(400);
  });

  it("rejects batches above the chunk size", async () => {
    const ids = Array.from({ length: BULK_ACCEPTED_ANSWERS_CHUNK_SIZE + 1 }, (_, i) => `i${i}`);
    const res = await bulkSuggest(suggestRequest({ item_ids: ids }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("dedupes duplicated item_ids before the chunk-size check", async () => {
    const ids = Array.from({ length: BULK_ACCEPTED_ANSWERS_CHUNK_SIZE * 2 }, () => "i1");
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockLlmResponse({ items: [{ index: 0, known: ["dobrá"], target: [] }] });
    const res = await bulkSuggest(
      suggestRequest({ item_ids: ids, translation_model: "deepseek/deepseek-v2-flash" }),
      makeCtx(),
    );
    expect(res.status).toBe(200);
    expect(mockCallOpenRouterChatParsed.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ model: "deepseek/deepseek-v2-flash" }),
    );
    const data = await res.json();
    expect(data.suggestions).toEqual([{ item_id: "i1", known: ["dobrá"], target: [] }]);
  });

  it("uses the sparse structured-output preset for the recommended model", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockLlmResponse({ items: [] });

    const res = await bulkSuggest(
      suggestRequest({ item_ids: ["i1"], translation_model: "anthropic/claude-sonnet-5" }),
      makeCtx(),
    );

    expect(res.status).toBe(200);
    const options = mockCallOpenRouterChatParsed.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options).toEqual(
      expect.objectContaining({
        model: "anthropic/claude-sonnet-5",
        maxTokens: 4_000,
        reasoning: undefined,
        responseFormat: expect.objectContaining({ type: "json_schema" }),
      }),
    );
    expect(options).not.toHaveProperty("temperature");
    const serializedFormat = JSON.stringify(options.responseFormat);
    expect(serializedFormat).not.toMatch(/minLength|maxLength|minimum|maximum|maxItems/);
  });

  it("keeps mandatory Gemini reasoning at minimal effort", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockLlmResponse({ items: [] });

    await bulkSuggest(
      suggestRequest({ item_ids: ["i1"], translation_model: "google/gemini-3.5-flash" }),
      makeCtx(),
    );

    expect(mockCallOpenRouterChatParsed.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ reasoning: { effort: "minimal" } }),
    );
  });

  it("keeps arbitrary custom models compatible with their provider capabilities", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockLlmResponse({ items: [] });

    await bulkSuggest(
      suggestRequest({ item_ids: ["i1"], translation_model: "vendor/custom-model" }),
      makeCtx(),
    );

    expect(mockCallOpenRouterChatParsed.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: "vendor/custom-model",
        reasoning: undefined,
        responseFormat: undefined,
      }),
    );
  });

  it("returns a useful provider error instead of an opaque 500", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockCallOpenRouterChatParsed.mockRejectedValue(
      new OpenRouterChatError("OpenRouter API error: 400 invalid JSON schema", false, 400),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "OpenRouter API error: 400 invalid JSON schema",
    });
    consoleError.mockRestore();
  });

  it("returns 400 without a stored OpenRouter key", async () => {
    mockGetUserApiKey.mockResolvedValue(null);
    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());
    expect(res.status).toBe(400);
  });

  it("reports foreign or textless items in skipped_item_ids", async () => {
    mockDbWhere.mockResolvedValue([
      makeItem("i1"),
      makeItem("i2", { listId: "other-list" }),
      makeItem("i3", { textTarget: "  " }),
    ]);
    mockLlmResponse({ items: [{ index: 0, known: [], target: ["vodku"] }] });
    const res = await bulkSuggest(
      suggestRequest({ item_ids: ["i1", "i2", "i3", "i4"] }),
      makeCtx(),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.suggestions).toEqual([{ item_id: "i1", known: [], target: ["vodku"] }]);
    expect(data.skipped_item_ids).toEqual(expect.arrayContaining(["i2", "i3", "i4"]));
  });

  it("ignores malformed indexes and treats omitted items as successful no-suggestion results", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1"), makeItem("i2")]);
    mockLlmResponse({
      items: [
        { index: "0", known: ["dobrá"], target: [] },
        { index: 0.5, known: ["dobrá"], target: [] },
        { index: -1, known: ["dobrá"], target: [] },
        { index: 7, known: ["dobrá"], target: [] },
        { index: 1, known: ["dobrá"], target: [] },
        { index: 1, known: ["dobré"], target: [] },
        "not-an-object",
      ],
    });
    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1", "i2"] }), makeCtx());
    const data = await res.json();
    // Only the first well-formed index 1 lands. The model may intentionally
    // omit i1 when it has no high-confidence alternative, so it is not skipped.
    expect(data.suggestions).toEqual([{ item_id: "i2", known: ["dobrá"], target: [] }]);
    expect(data.skipped_item_ids).toEqual([]);
  });

  it("returns a useful error for an invalid top-level LLM response", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1")]);
    mockLlmResponse({ result: [] });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "OpenRouter returned an invalid accepted-answer response.",
    });
    consoleError.mockRestore();
  });

  it("drops suggestions whose length differs from the primary and caps by remaining room", async () => {
    mockDbWhere.mockResolvedValue([
      makeItem("i1", {
        acceptedTarget: Array.from({ length: MAX_ACCEPTED_ANSWERS - 1 }, (_, i) => `vodk${i}`),
      }),
    ]);
    mockLlmResponse({
      items: [
        {
          index: 0,
          known: ["dobrá", "dobřejší"],
          target: ["vodky", "vodku", "spirit"],
        },
      ],
    });
    const res = await bulkSuggest(suggestRequest({ item_ids: ["i1"] }), makeCtx());
    const data = await res.json();
    // "dobřejší" fails the same-length filter; only one target slot remains.
    expect(data.suggestions).toEqual([{ item_id: "i1", known: ["dobrá"], target: ["vodky"] }]);
  });
});

describe("POST /api/lists/[id]/accepted-answers/bulk-apply", () => {
  it("returns 401 without a user", async () => {
    mockResolveUserFromRequest.mockResolvedValue(null);
    const res = await bulkApply(applyRequest({ items: [] }), makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed items payload", async () => {
    const res = await bulkApply(
      applyRequest({ items: [{ item_id: "i1", known: "not-an-array", target: [] }] }),
      makeCtx(),
    );
    expect(res.status).toBe(400);
  });

  it("merges additions into the current DB state instead of overwriting it", async () => {
    // 'dobrá' was added elsewhere after the preview; it must survive the apply.
    mockDbWhere.mockResolvedValue([makeItem("i1", { acceptedKnown: ["dobrá"] })]);
    const res = await bulkApply(
      applyRequest({ items: [{ item_id: "i1", known: ["dobré", "DOBRÁ", "dobrý"], target: [] }] }),
      makeCtx(),
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(mockUpdateItemTranslations).toHaveBeenCalledWith([
      { id: "i1", acceptedKnown: ["dobrá", "dobré"] },
    ]);
    expect(data.applied_item_ids).toEqual(["i1"]);
    expect(data.items).toEqual([{ item_id: "i1", known: ["dobrá", "dobré"] }]);
  });

  it("caps the merged list at MAX_ACCEPTED_ANSWERS", async () => {
    mockDbWhere.mockResolvedValue([
      makeItem("i1", {
        acceptedKnown: Array.from({ length: MAX_ACCEPTED_ANSWERS - 1 }, (_, i) => `v${i}`),
      }),
    ]);
    await bulkApply(
      applyRequest({ items: [{ item_id: "i1", known: ["nová", "další"], target: [] }] }),
      makeCtx(),
    );
    const [updates] = mockUpdateItemTranslations.mock.calls[0];
    expect(updates[0].acceptedKnown).toHaveLength(MAX_ACCEPTED_ANSWERS);
  });

  it("skips foreign items and entries with nothing to add", async () => {
    mockDbWhere.mockResolvedValue([makeItem("i1"), makeItem("i2", { listId: "other" })]);
    const res = await bulkApply(
      applyRequest({
        items: [
          { item_id: "i1", known: [], target: [] },
          { item_id: "i2", known: ["dobrá"], target: [] },
          { item_id: "i3", known: ["dobrá"], target: [] },
        ],
      }),
      makeCtx(),
    );
    const data = await res.json();
    expect(mockUpdateItemTranslations).not.toHaveBeenCalled();
    expect(data.applied_item_ids).toEqual([]);
    expect(data.skipped_item_ids).toEqual(expect.arrayContaining(["i1", "i2", "i3"]));
  });
});
