import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRouterAdapter } from "@/lib/providers/openrouter";

describe("openRouterAdapter.exchangeCode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the configured bearer token during code exchange", async () => {
    vi.stubEnv("OPENROUTER_OAUTH_BEARER_TOKEN", "app-token");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ key: "sk-openrouter" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await openRouterAdapter.exchangeCode({
      code: "auth-code",
      codeVerifier: "verifier",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/auth/keys",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer app-token",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("fails clearly when the exchange bearer token is missing", async () => {
    await expect(
      openRouterAdapter.exchangeCode({
        code: "auth-code",
        codeVerifier: "verifier",
      }),
    ).rejects.toThrow(/OPENROUTER_OAUTH_BEARER_TOKEN|OPENROUTER_API_KEY/);
  });
});
