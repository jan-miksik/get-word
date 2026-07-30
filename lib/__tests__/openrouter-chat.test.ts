import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callOpenRouterChatParsed,
  OpenRouterChatError,
} from "@/lib/openrouter-chat";

describe("callOpenRouterChatParsed", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("passes reasoning and strict response-format controls to OpenRouter", async () => {
    let requestBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: '{"items":[]}' } }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await callOpenRouterChatParsed(
      {
        apiKey: "test-key",
        apiUrl: "https://openrouter.test/chat/completions",
        model: "anthropic/claude-sonnet-5",
        messages: [{ role: "user", content: "Return JSON" }],
        maxTokens: 4_000,
        temperature: 0,
        reasoning: { enabled: false },
        responseFormat: { type: "json_schema", json_schema: { name: "test" } },
      },
      JSON.parse,
    );

    expect(requestBody).toEqual(expect.objectContaining({
      model: "anthropic/claude-sonnet-5",
      max_tokens: 4_000,
      temperature: 0,
      reasoning: { enabled: false },
      response_format: { type: "json_schema", json_schema: { name: "test" } },
    }));
  });

  it("reports usage for a paid response even when parsing rejects and retries it", async () => {
    const onResponse = vi.fn();
    const onAttemptStart = vi.fn();
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            usage: { prompt_tokens: 100, completion_tokens: 20 },
            choices: [{ finish_reason: "stop", message: { content: "not-json" } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            usage: { prompt_tokens: 110, completion_tokens: 25 },
            choices: [
              {
                finish_reason: "stop",
                message: { content: '{"items":[]}' },
              },
            ],
          }),
          { status: 200 },
        ),
      ) as typeof fetch;

    await expect(
      callOpenRouterChatParsed(
        {
          apiKey: "test-key",
          apiUrl: "https://openrouter.test/chat/completions",
          model: "anthropic/claude-sonnet-5",
          messages: [{ role: "user", content: "Return JSON" }],
          maxAttempts: 2,
          retryBaseDelayMs: 0,
          onResponse,
          onAttemptStart,
        },
        (content) => {
          try {
            return JSON.parse(content);
          } catch {
            throw new OpenRouterChatError("Malformed model JSON.", true);
          }
        },
      ),
    ).resolves.toEqual({ items: [] });

    expect(onResponse).toHaveBeenCalledTimes(2);
    expect(onAttemptStart).toHaveBeenCalledTimes(2);
    expect(onResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    );
  });
});
