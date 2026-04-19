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

  it("exchanges the auth code without an Authorization header by default", async () => {
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
        headers: {
          "content-type": "application/json",
        },
      }),
    );
  });

  it("sends a bearer token during exchange when one is configured", async () => {
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
        headers: {
          Authorization: "Bearer app-token",
          "content-type": "application/json",
        },
      }),
    );
  });

  it("fails clearly when the exchange response does not include an API key", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      openRouterAdapter.exchangeCode({
        code: "auth-code",
        codeVerifier: "verifier",
      }),
    ).rejects.toThrow(/did not include an API key/);
  });
});
