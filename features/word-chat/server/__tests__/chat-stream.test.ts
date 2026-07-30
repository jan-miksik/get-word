import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamOpenRouterCompletion: vi.fn(),
  recordWordChatUsage: vi.fn(),
  reserveWordChatSpend: vi.fn(async () => ({
    id: "reservation-1",
    model: "test/chat",
    reservedUsd: 0.1,
    maxAttempts: 2,
  })),
}));

vi.mock("@/lib/openrouter-chat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-chat")>();
  return {
    ...actual,
    streamOpenRouterCompletion: mocks.streamOpenRouterCompletion,
  };
});

vi.mock("../usage", () => ({
  aggregateWordChatUsage: (metas: unknown[]) => metas.at(-1) ?? {},
  recordWordChatUsage: mocks.recordWordChatUsage,
  reserveWordChatSpend: mocks.reserveWordChatSpend,
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
          readyToPropose: { type: "boolean" },
          contentMode: { anyOf: [{ type: "string" }, { type: "null" }] },
          suggestions: { type: "array", items: { type: "string" } },
          languageChange: { type: "null" },
          reply: { type: "string" },
        },
        required: ["readyToPropose", "contentMode", "suggestions", "languageChange", "reply"],
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
import type { WordChatMessage } from "../../types";

async function* modelStream(chunks: string[]) {
  for (const text of chunks) yield { type: "delta" as const, text };
  yield { type: "done" as const, meta: { id: "call-1" } };
}

async function collectTurn(
  chunks: string[],
  messages: WordChatMessage[] = [{ role: "user", content: "Kavárna" }],
) {
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
    messages,
  });
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

/** A transcript in which the learner has already answered one follow-up. */
const answeredFollowUp: WordChatMessage[] = [
  { role: "user", content: "Kavárna" },
  { role: "assistant", content: "S kým tam nejčastěji mluvíte?" },
  { role: "user", content: "Se stálými zákazníky." },
];

describe("streamChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamOpenRouterCompletion.mockReset();
    mocks.recordWordChatUsage.mockReset();
    mocks.reserveWordChatSpend.mockClear();
    process.env.OPENROUTER_SERVER_API_KEY = "test-key";
  });

  it("does not expose a reply when gate metadata is invalid", async () => {
    await expect(
      collectTurn(['{"readyToPropose":true,"contentMode":null,"suggestions":[],"languageChange":null,"reply":"Hotovo"}']),
    ).rejects.toBeInstanceOf(OpenRouterChatError);
    expect(mocks.streamOpenRouterCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: { effort: "low", exclude: true },
        responseFormat: expect.objectContaining({ type: "json_schema" }),
      }),
    );
  });

  it("keeps a partial visible reply only after valid gate metadata", async () => {
    const events = await collectTurn(['{"readyToPropose":false,"contentMode":null,"suggestions":[],"languageChange":null,"reply":"Skoro hot']);

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
      .mockResolvedValueOnce(modelStream(['{"readyToPropose":false,"contentMode":null,"suggestions":[],"languageChange":null,"reply":"Hotovo"}']));

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
      '{"readyToPropose":false,"contentMode":null,"suggestions":[],',
      '"languageChange":{"from":"cs","to":"es"},"reply":"Přepínám na češtinu a španělštinu."}',
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "done",
      languageChange: { from: "cs", to: "es" },
      readyToPropose: false,
      metadataValid: true,
    });
  });

  it("requires a finalized mode after the one follow-up is answered", async () => {
    // The prompt allows a single follow-up question. Once its answer is in the
    // transcript, a model that keeps interviewing would spend the learner's
    // turns on questions they never asked for.
    const events = await collectTurn(
      ['{"readyToPropose":true,"contentMode":"situation","suggestions":[],"languageChange":null,"reply":"Připravím návrh."}'],
      answeredFollowUp,
    );

    expect(events.at(-1)).toMatchObject({ type: "done", readyToPropose: true });
  });

  it("still lets the first turn decide for itself", async () => {
    const events = await collectTurn([
      '{"readyToPropose":false,"contentMode":null,"suggestions":["Se zákazníky"],"languageChange":null,"reply":"S kým tam mluvíte?"}',
    ]);

    expect(events.at(-1)).toMatchObject({ type: "done", readyToPropose: false });
  });

  it("never forces a proposal on a language-change turn", async () => {
    // Proposing here would generate words for the pair the learner just left.
    const events = await collectTurn(
      [
        '{"readyToPropose":false,"contentMode":null,"suggestions":[],',
        '"languageChange":{"from":"cs","to":"es"},"reply":"Přepínám na španělštinu."}',
      ],
      answeredFollowUp,
    );

    expect(events.at(-1)).toMatchObject({
      type: "done",
      readyToPropose: false,
      languageChange: { from: "cs", to: "es" },
    });
  });

  it("drops a malformed language action instead of defaulting it to English", async () => {
    const events = await collectTurn([
      '{"readyToPropose":false,"contentMode":null,"suggestions":[],',
      '"languageChange":{"from":"not a code","to":"es"},"reply":"Nemohu ten jazyk rozpoznat."}',
    ]);

    expect(events.at(-1)).toMatchObject({
      type: "done",
      languageChange: null,
    });
  });
});
