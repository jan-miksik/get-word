import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveUserFromRequest = vi.fn();
const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock("@/lib/auth", () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  forbiddenResponse: (message?: string) =>
    new Response(JSON.stringify({ error: message ?? "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    }),
}));

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

import { POST } from "../connect/start/route";

describe("POST /api/providers/openrouter/connect/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClientIp.mockReturnValue("127.0.0.1");
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      count: 1,
      retryAfterSeconds: 30,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when user is missing", async () => {
    mockResolveUserFromRequest.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/connect/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnTo: "/lists" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not linked", async () => {
    mockResolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: null,
      walletAddress: null,
    });

    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/connect/start", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "device-1" },
      body: JSON.stringify({ returnTo: "/lists" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns authorize URL and sets OAuth cookie for linked users", async () => {
    mockResolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      walletAddress: null,
    });

    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/connect/start", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "device-1" },
      body: JSON.stringify({ returnTo: "/lists" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.authorizeUrl).toBe("string");
    expect(body.authorizeUrl).toContain("openrouter.ai/auth");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("get_word_openrouter_oauth=");
  });

  it("uses the forwarded deployment origin when production env still points at localhost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GET_WORD_APP_URL", "http://localhost:3000");
    vi.stubEnv("APP_SESSION_SECRET", "test-production-secret");
    mockResolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      walletAddress: null,
    });

    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/connect/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-device-id": "device-1",
        "x-forwarded-host": "dev.getword.app",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ returnTo: "/lists" }),
    });

    const res = await POST(req);
    const body = await res.json();
    const authorizeUrl = new URL(body.authorizeUrl);
    const callbackUrl = new URL(authorizeUrl.searchParams.get("callback_url") ?? "");

    expect(callbackUrl.origin).toBe("https://dev.getword.app");
    expect(callbackUrl.pathname).toBe("/api/providers/openrouter/callback");
  });
});
