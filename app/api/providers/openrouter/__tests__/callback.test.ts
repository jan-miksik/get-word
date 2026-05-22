import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockParseOAuthState = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
const mockExchangeCode = vi.fn();
const mockTestConnection = vi.fn();
const mockUpsertProviderSecret = vi.fn();

vi.mock("@/lib/providers/oauth-state", () => ({
  OPENROUTER_OAUTH_COOKIE_NAME: "get_word_openrouter_oauth",
  parseOAuthState: (...args: unknown[]) => mockParseOAuthState(...args),
}));

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

vi.mock("@/lib/providers/openrouter", () => ({
  openRouterAdapter: {
    exchangeCode: (...args: unknown[]) => mockExchangeCode(...args),
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
  },
}));

vi.mock("@/lib/providers/store", () => ({
  upsertProviderSecret: (...args: unknown[]) => mockUpsertProviderSecret(...args),
}));

import { GET } from "../callback/route";

describe("GET /api/providers/openrouter/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue("127.0.0.1");
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSeconds: 20,
    });
  });

  it("redirects with invalid_state when state payload is missing", async () => {
    mockParseOAuthState.mockReturnValue(null);
    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/callback?state=abc");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("openrouter=failed");
    expect(res.headers.get("location")).toContain("reason=invalid_state");
  });

  it("redirects with missing_code when no code is returned", async () => {
    mockParseOAuthState.mockReturnValue({
      userId: "user-1",
      state: "expected",
      returnTo: "/lists",
    });
    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/callback?state=expected");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("reason=missing_code");
  });

  it("upserts key and redirects with connected on success", async () => {
    mockParseOAuthState.mockReturnValue({
      userId: "user-1",
      state: "expected",
      codeVerifier: "verifier",
      returnTo: "/lists",
    });
    mockExchangeCode.mockResolvedValue({
      apiKey: "sk-openrouter",
      keyLabel: "Primary",
    });
    mockTestConnection.mockResolvedValue({
      ok: true,
      keyLabel: "Primary",
    });
    mockUpsertProviderSecret.mockResolvedValue({});

    const req = new NextRequest(
      "http://localhost:3000/api/providers/openrouter/callback?state=expected&code=auth-code",
    );
    const res = await GET(req);

    expect(mockExchangeCode).toHaveBeenCalledWith({
      code: "auth-code",
      codeVerifier: "verifier",
    });
    expect(mockUpsertProviderSecret).toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("openrouter=connected");
  });
});
