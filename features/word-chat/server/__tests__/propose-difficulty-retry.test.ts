import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

const mocks = vi.hoisted(() => ({
  callOpenRouterChatParsedWithMeta: vi.fn(),
  recordWordChatUsage: vi.fn(async () => undefined),
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

vi.mock("../usage", () => ({ recordWordChatUsage: mocks.recordWordChatUsage }));

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
  reviewLabel: "Cafe basics",
  items: [
    { kind: "sentence", text: "Dám si kávu.", confidence: 0.9 },
    { kind: "sentence", text: "Chci čaj.", confidence: 0.9 },
    { kind: "sentence", text: "Kde je účet?", confidence: 0.9 },
    ...["káva", "čaj", "účet", "mléko", "cukr", "voda", "stůl"].map((text) => ({
      kind: "word",
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
