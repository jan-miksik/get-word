import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenRouterChatParsed } from "@/lib/openrouter-chat";

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
});
