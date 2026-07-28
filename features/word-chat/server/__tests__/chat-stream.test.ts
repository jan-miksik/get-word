import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamOpenRouterCompletion: vi.fn(),
  recordWordChatUsage: vi.fn(),
}));

vi.mock("@/lib/openrouter-chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-chat")>();
  return {
    ...actual,
    streamOpenRouterCompletion: mocks.streamOpenRouterCompletion,
  };
});

vi.mock("../usage", () => ({
  recordWordChatUsage: mocks.recordWordChatUsage,
}));

vi.mock("../config", () => ({
  CHAT_MAX_TOKENS: 600,
  CHAT_REASONING: { effort: "low", exclude: true },
  CHAT_RESPONSE_FORMAT: {
    type: "json_schema",
    json_schema: {
      name: "word_chat_turn",
      strict: true,
      schema: {
        type: "object",
        properties: {
          reply: { type: "string" },
          suggestions: { type: "array", items: { type: "string" } },
          readyToPropose: { type: "boolean" },
        },
        required: ["reply", "suggestions", "readyToPropose"],
        additionalProperties: false,
      },
    },
  },
  MAX_MESSAGES_PER_SESSION: 12,
  MAX_USER_MESSAGE_CHARS: 500,
  OPENROUTER_API_URL: "https://openrouter.test/chat/completions",
  OPENROUTER_MAX_ATTEMPTS: 2,
  OPENROUTER_RETRY_BASE_DELAY_MS: 1,
  OPENROUTER_TIMEOUT_MS: 1_000,
  WORD_CHAT_CHAT_MODEL: "test/chat",
  WORD_CHAT_PROVIDER_PREFERENCES: {},
  estimateCostUsd: () => 0,
  getServerApiKey: () => process.env.OPENROUTER_SERVER_API_KEY,
}));

import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { streamChatTurn } from "../chat";

async function* modelStream(chunks: string[]) {
  for (const text of chunks) yield { type: "delta" as const, text };
  yield { type: "done" as const, meta: { id: "call-1" } };
}

async function collectTurn(chunks: string[]) {
  mocks.streamOpenRouterCompletion.mockResolvedValue(modelStream(chunks));
  const stream = await streamChatTurn({
    userId: "user-1",
    sessionId: "session-1",
    languageFrom: "cs",
    languageTo: "vi",
    chatLanguage: "cs",
    addressRegister: "casual",
    salutationGender: "neutral",
    languageLevel: "A0",
    brief: null,
    messages: [{ role: "user", content: "Kavárna" }],
  });
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("streamChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamOpenRouterCompletion.mockReset();
    mocks.recordWordChatUsage.mockReset();
    process.env.OPENROUTER_SERVER_API_KEY = "test-key";
  });

  it("keeps a complete reply when final metadata is invalid", async () => {
    const events = await collectTurn(['{"reply":"Hotovo",']);

    expect(events).toEqual([
      { type: "delta", text: "Hotovo" },
      expect.objectContaining({
        type: "done",
        reply: "Hotovo",
        suggestions: [],
        readyToPropose: false,
        metadataValid: false,
      }),
    ]);
    expect(mocks.recordWordChatUsage).toHaveBeenCalledWith(
      expect.objectContaining({ callType: "chat", model: expect.any(String) }),
    );
    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { effort: "low", exclude: true },
        responseFormat: expect.objectContaining({ type: "json_schema" }),
      }),
    );
  });

  it("keeps a partial visible reply when the stream ends mid-reply", async () => {
    const events = await collectTurn(['{"reply":"Skoro hot']);

    expect(events).toEqual([
      { type: "delta", text: "Skoro hot" },
      expect.objectContaining({
        type: "done",
        reply: "Skoro hot",
        suggestions: [],
        readyToPropose: false,
        metadataValid: false,
      }),
    ]);
  });

  it("retries parser failures before any visible reply", async () => {
    mocks.streamOpenRouterCompletion
      .mockResolvedValueOnce(modelStream(["not-json"]))
      .mockResolvedValueOnce(modelStream(['{"reply":"Hotovo","suggestions":[]}']));

    const stream = await streamChatTurn({
      userId: "user-1",
      sessionId: "session-1",
      languageFrom: "cs",
      languageTo: "vi",
      chatLanguage: "cs",
      addressRegister: "casual",
      salutationGender: "neutral",
      languageLevel: "A0",
      brief: null,
      messages: [{ role: "user", content: "Kavárna" }],
    });
    const events = [];
    for await (const event of stream) events.push(event);

    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { type: "delta", text: "Hotovo" },
      expect.objectContaining({
        type: "done",
        reply: "Hotovo",
        metadataValid: true,
      }),
    ]);
  });

  it("fails when the streamed JSON never contains reply", async () => {
    await expect(collectTurn(['{"suggestions":[]}'])).rejects.toBeInstanceOf(
      OpenRouterChatError,
    );
  });

  it("returns a validated language-pair action after the reply", async () => {
    const events = await collectTurn([
      '{"reply":"Přepínám na češtinu a španělštinu.",',
      '"suggestions":[],"readyToPropose":false,',
      '"languageChange":{"from":"cs","to":"es"}}',
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "done",
      languageChange: { from: "cs", to: "es" },
      readyToPropose: false,
      metadataValid: true,
    });
  });

  it("drops a malformed language action instead of defaulting it to English", async () => {
    const events = await collectTurn([
      '{"reply":"Nemohu ten jazyk rozpoznat.",',
      '"suggestions":[],"readyToPropose":false,',
      '"languageChange":{"from":"not a code","to":"es"}}',
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "done",
      languageChange: null,
    });
  });
});
