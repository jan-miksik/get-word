import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveUserFromRequest = vi.fn();
const mockDeleteAccount = vi.fn();
const mockConsumeRateLimit = vi.fn();

vi.mock("@/lib/auth", () => ({
  resolveUserFromRequest: (...args: unknown[]) => mockResolveUserFromRequest(...args),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/features/auth/server/delete-account", () => ({
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: () => "203.0.113.1",
}));

import { DELETE } from "../account/route";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://getword.app/api/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation: "user@example.com" }),
    headers: { "Content-Type": "application/json", host: "getword.app", ...headers },
  });
}

describe("DELETE /api/auth/account origin guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsumeRateLimit.mockResolvedValue({ allowed: true });
    mockResolveUserFromRequest.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockDeleteAccount.mockResolvedValue({ status: "deleted" });
  });

  it("accepts the same-origin web app", async () => {
    const response = await DELETE(request({ origin: "https://getword.app" }));

    expect(response.status).toBe(200);
    expect(mockDeleteAccount).toHaveBeenCalledWith("user-1");
  });

  // The native bundle is served from a custom scheme, so every call it makes is
  // cross-origin. It authenticates with a bearer token, not the cookie.
  it.each(["capacitor://localhost", "ionic://localhost", "https://localhost"])(
    "accepts the native client on %s",
    async (origin) => {
      const response = await DELETE(request({ origin }));

      expect(response.status).toBe(200);
      expect(mockDeleteAccount).toHaveBeenCalledWith("user-1");
    },
  );

  it("still rejects an unrelated cross-site origin", async () => {
    const response = await DELETE(request({ origin: "https://evil.example" }));

    expect(response.status).toBe(403);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});
