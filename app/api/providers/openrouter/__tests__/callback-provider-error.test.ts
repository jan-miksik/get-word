import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockParseOAuthState = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();

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
    exchangeCode: vi.fn(),
    testConnection: vi.fn(),
  },
}));

vi.mock("@/lib/providers/store", () => ({
  upsertProviderSecret: vi.fn(),
}));

import { GET } from "../callback/route";

describe("GET /api/providers/openrouter/callback provider errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue("127.0.0.1");
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSeconds: 20,
    });
    mockParseOAuthState.mockReturnValue({
      userId: "user-1",
      state: "expected",
      codeVerifier: "verifier",
      returnTo: "/lists",
    });
  });

  it("redirects with provider_error when OpenRouter returns an oauth error", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/providers/openrouter/callback?state=expected&error=access_denied&error_description=user%20cancelled",
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("openrouter=failed");
    expect(res.headers.get("location")).toContain("reason=provider_error");
  });
});
