import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifySession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({
  GET_WORD_SESSION_COOKIE_NAME: "get_word_session",
  verifySession: mockVerifySession,
}));

import { config, proxy } from "../proxy";

function makeRequest(pathname: string, token?: string) {
  return new NextRequest(`http://localhost:3000${pathname}`, {
    headers: token ? { cookie: `get_word_session=${token}` } : undefined,
  });
}

function expectNextResponse(response: Response) {
  expect(response.headers.get("x-middleware-next")).toBe("1");
}

function expectRedirectToRoot(response: Response) {
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/");
}

describe("proxy auth gate", () => {
  beforeEach(() => {
    mockVerifySession.mockReset();
  });

  it("matches the guarded routes", () => {
    expect(config.matcher).toEqual([
      "/",
      "/edit/:path*",
      "/lists/:path*",
      "/login",
    ]);
  });

  it("allows anonymous users to access the home page", async () => {
    mockVerifySession.mockResolvedValue(null);

    const response = await proxy(makeRequest("/"));

    expect(mockVerifySession).toHaveBeenCalledWith(undefined);
    expectNextResponse(response);
  });

  it("allows anonymous users to access login", async () => {
    mockVerifySession.mockResolvedValue(null);

    const response = await proxy(makeRequest("/login"));

    expect(mockVerifySession).toHaveBeenCalledWith(undefined);
    expectNextResponse(response);
  });

  it("allows authenticated users to access login", async () => {
    mockVerifySession.mockResolvedValue({ userId: "user-1", userRole: "user" });

    const response = await proxy(makeRequest("/login", "valid-token"));

    expect(mockVerifySession).toHaveBeenCalledWith("valid-token");
    expectNextResponse(response);
  });

  it("redirects anonymous users away from lists", async () => {
    mockVerifySession.mockResolvedValue(null);

    const response = await proxy(makeRequest("/lists", "expired-token"));

    expect(mockVerifySession).toHaveBeenCalledWith("expired-token");
    expectRedirectToRoot(response);
  });

  it("allows authenticated users to access lists", async () => {
    mockVerifySession.mockResolvedValue({ userId: "user-1", userRole: "user" });

    const response = await proxy(makeRequest("/lists/abc", "valid-token"));

    expect(mockVerifySession).toHaveBeenCalledWith("valid-token");
    expectNextResponse(response);
  });

  it("redirects non-editors away from edit routes", async () => {
    mockVerifySession.mockResolvedValue({ userId: "user-1", userRole: "user" });

    const response = await proxy(makeRequest("/edit", "valid-token"));

    expectRedirectToRoot(response);
  });

  it("allows editors to access edit routes", async () => {
    mockVerifySession.mockResolvedValue({ userId: "editor-1", userRole: "editor" });

    const response = await proxy(makeRequest("/edit/words", "editor-token"));

    expectNextResponse(response);
  });
});
