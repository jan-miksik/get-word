import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockResolveUserFromRequest = vi.fn();
const mockGetProviderSecret = vi.fn();
const mockTestConnection = vi.fn();
const mockMarkProviderConnectionStatus = vi.fn();

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

vi.mock("@/lib/providers/store", () => ({
  getProviderSecret: (...args: unknown[]) => mockGetProviderSecret(...args),
  markProviderConnectionStatus: (...args: unknown[]) => mockMarkProviderConnectionStatus(...args),
}));

vi.mock("@/lib/providers/openrouter", () => ({
  openRouterAdapter: {
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
  },
}));

import { POST } from "../test/route";

describe("POST /api/providers/openrouter/test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserFromRequest.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      walletAddress: null,
    });
  });

  it("returns 404 when key is missing", async () => {
    mockGetProviderSecret.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/test", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns ok and updates status on successful test", async () => {
    mockGetProviderSecret.mockResolvedValue("sk-openrouter");
    mockTestConnection.mockResolvedValue({ ok: true, keyLabel: "Main" });
    mockMarkProviderConnectionStatus.mockResolvedValue({ provider: "openrouter", status: "connected" });

    const req = new NextRequest("http://localhost:3000/api/providers/openrouter/test", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockMarkProviderConnectionStatus).toHaveBeenCalled();
  });
});
