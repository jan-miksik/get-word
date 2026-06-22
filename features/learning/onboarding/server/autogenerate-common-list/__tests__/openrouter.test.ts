import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordList } from "@/lib/db/schema";

vi.mock("../helpers", () => ({
  cleanText: (value: unknown) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "",
  cleanCategory: (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : "Common",
}));

import { generateFromOpenRouterSeed } from "../openrouter";

function openRouterResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: "stop",
      message: { content: JSON.stringify({ items }) },
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("generateFromOpenRouterSeed", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_SERVER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_SERVER_API_KEY = "test-key";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.OPENROUTER_SERVER_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  it("recovers omitted rows and restores source order", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(openRouterResponse([
        { sourceIndex: 2, known: "three", target: "ba", category: "Numbers" },
        { sourceIndex: 0, known: "one", target: "một", category: "Numbers" },
      ]))
      .mockResolvedValueOnce(openRouterResponse([
        { sourceIndex: 1, known: "two", target: "hai", category: "Numbers" },
      ])) as typeof fetch;

    const result = await generateFromOpenRouterSeed({
      languageFrom: "en",
      languageTo: "vi",
      sourceLanguage: "en",
      sourceList: { id: "seed", name: "Seed" } as WordList,
      sourceItems: [
        { sourceIndex: 0, source: "one", category: "Numbers" },
        { sourceIndex: 1, source: "two", category: "Numbers" },
        { sourceIndex: 2, source: "three", category: "Numbers" },
      ],
    });

    expect(result.map((item) => item.sourceIndex)).toEqual([0, 1, 2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps usable rows when omitted-row recovery fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(openRouterResponse([
        { sourceIndex: 0, known: "one", target: "một", category: "Numbers" },
      ]))
      .mockResolvedValueOnce(new Response("bad request", { status: 400 })) as typeof fetch;

    const result = await generateFromOpenRouterSeed({
      languageFrom: "en",
      languageTo: "vi",
      sourceLanguage: "en",
      sourceList: { id: "seed", name: "Seed" } as WordList,
      sourceItems: [
        { sourceIndex: 0, source: "one", category: "Numbers" },
        { sourceIndex: 1, source: "two", category: "Numbers" },
      ],
    });

    expect(result.map((item) => item.sourceIndex)).toEqual([0]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
