import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

const mocks = vi.hoisted(() => ({
  callOpenRouterChatParsedWithMeta: vi.fn(),
  recordWordChatUsage: vi.fn(async () => undefined),
  runReservedWordChatCall: vi.fn(
    async (
      _input: unknown,
      run: (hooks: {
        onResponse: (meta: unknown) => void;
        onAttemptStart: () => void;
      }) => Promise<unknown>,
    ) => ({
      result: await run({
        onResponse: () => undefined,
        onAttemptStart: () => undefined,
      }),
      reservation: {
        id: "reservation-1",
        model: "test/model",
        reservedUsd: 0.1,
        maxAttempts: 3,
      },
      meta: {},
      responseCount: 1,
      usageObserved: false,
      minimumCostUsd: 0,
    }),
  ),
}));

vi.mock("@/lib/openrouter-chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/openrouter-chat")>(
    "@/lib/openrouter-chat",
  );
  return {
    ...actual,
    callOpenRouterChatParsedWithMeta: mocks.callOpenRouterChatParsedWithMeta,
  };
});

vi.mock("../usage", () => ({
  recordWordChatUsage: mocks.recordWordChatUsage,
  runReservedWordChatCall: mocks.runReservedWordChatCall,
}));

vi.mock("../corpus", async () => {
  const actual = await vi.importActual<typeof import("../corpus")>("../corpus");
  return {
    ...actual,
    loadCorpusPool: vi.fn(async () => []),
    loadExclusions: vi.fn(async () => []),
    loadTakeoverCandidates: vi.fn(async () => []),
  };
});

import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { proposeItems } from "../propose";

/**
 * A batch the difficulty guard rejects: three very short sentences padded out
 * with bare single-word labels at B1.
 */
const STARTER_BATCH = JSON.stringify({
  categoryName: "Kavárna",
  topicLabel: "Kavárna",
  reviewLabel: "Cafe basics",
  items: [
    { kind: "sentence", role: "sentence", text: "Dám si kávu.", confidence: 0.9 },
    { kind: "sentence", role: "sentence", text: "Chci čaj.", confidence: 0.9 },
    { kind: "sentence", role: "sentence", text: "Kde je účet?", confidence: 0.9 },
    ...["káva", "čaj", "účet", "mléko", "cukr", "voda", "stůl"].map((text) => ({
      kind: "word",
      role: "situational_expression",
      text,
      confidence: 0.8,
    })),
  ],
});

/**
 * Replays the real retry loop: `parse` runs once per attempt and a retryable
 * throw buys another one, exactly as `callOpenRouterChatParsedWithMeta` does.
 */
function replayRetries(content: string, maxAttempts: number) {
  return async (
    _options: unknown,
    parse: (raw: string) => unknown,
  ): Promise<{ value: unknown; meta: Record<string, unknown> }> => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return { value: parse(content), meta: {} };
      } catch (err) {
        if (!(err instanceof OpenRouterChatError) || !err.retryable) throw err;
        lastError = err;
      }
    }
    throw lastError;
  };
}

const INPUT = {
  userId: "user-1",
  sessionId: "session-1",
  languageFrom: "cs",
  languageTo: "vi",
  chatLanguage: "cs",
  languageLevel: "B1" as const,
  contentMode: "situation" as const,
  brief: null,
  messages: [{ role: "user" as const, content: "Kavárna" }],
};

describe("proposeItems difficulty guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_SERVER_API_KEY = "test-key";
  });

  it("stands down after its retry budget instead of failing the request", async () => {
    // The guard is a heuristic. Spending every attempt on it would trade a
    // slightly-too-easy list — which is still usable — for an error screen,
    // and charge the learner for all three attempts on the way there.
    mocks.callOpenRouterChatParsedWithMeta.mockImplementation(
      replayRetries(STARTER_BATCH, 3),
    );

    const result = await proposeItems(INPUT);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.topicLabel).toBe("Kavárna");
  });

  it("still spends one fresh attempt trying to get a harder batch", async () => {
    let parseCalls = 0;
    mocks.callOpenRouterChatParsedWithMeta.mockImplementation(
      async (_options: unknown, parse: (raw: string) => unknown) => {
        const attempt = () => {
          parseCalls += 1;
          return parse(STARTER_BATCH);
        };
        try {
          return { value: attempt(), meta: {} };
        } catch {
          return { value: attempt(), meta: {} };
        }
      },
    );

    await proposeItems(INPUT);

    expect(parseCalls).toBe(2);
  });

  it("spends a fresh attempt when the batch came back in English", async () => {
    // The learner reads Czech. A batch in English is unusable at any level, and
    // a retry is the only thing that can fix it.
    const englishBatch = JSON.stringify({
      categoryName: "Cafe",
      topicLabel: "Cafe",
      reviewLabel: "Cafe basics",
      items: [
        { kind: "sentence", role: "sentence", text: "Could you split the bill?", confidence: 0.9 },
        { kind: "sentence", role: "sentence", text: "I think this item was charged twice.", confidence: 0.9 },
        { kind: "sentence", role: "sentence", text: "Where is the entrance?", confidence: 0.9 },
        ...["bill", "receipt", "change", "table", "tip", "menu", "waiter"].map((text) => ({
          kind: "word",
          role: "situational_expression",
          text,
          confidence: 0.8,
        })),
      ],
    });

    let parseCalls = 0;
    mocks.callOpenRouterChatParsedWithMeta.mockImplementation(
      async (_options: unknown, parse: (raw: string) => unknown) => {
        const attempt = () => {
          parseCalls += 1;
          return parse(englishBatch);
        };
        try {
          return { value: attempt(), meta: {} };
        } catch {
          // The guard stands down on the second attempt, so this one lands.
          return { value: attempt(), meta: {} };
        }
      },
    );

    const result = await proposeItems({ ...INPUT, languageLevel: "A1" });

    expect(parseCalls).toBe(2);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("never rejects an A-level batch for difficulty", async () => {
    let parseCalls = 0;
    mocks.callOpenRouterChatParsedWithMeta.mockImplementation(
      async (_options: unknown, parse: (raw: string) => unknown) => {
        parseCalls += 1;
        return { value: parse(STARTER_BATCH), meta: {} };
      },
    );

    await proposeItems({ ...INPUT, languageLevel: "A1" });

    expect(parseCalls).toBe(1);
  });
});
