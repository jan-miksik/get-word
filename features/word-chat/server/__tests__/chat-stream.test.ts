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
  MAX_USER_MESSAGE_CHARS: 500,
  OPENROUTER_API_URL: "https://openrouter.test/chat/completions",
  OPENROUTER_MAX_ATTEMPTS: 1,
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
  });

  it("fails when the streamed JSON never contains reply", async () => {
    await expect(collectTurn(['{"suggestions":[]}'])).rejects.toBeInstanceOf(
      OpenRouterChatError,
    );
  });
});
