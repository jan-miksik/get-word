import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiKeySettings } from "../ApiKeySettings";

vi.mock("@/lib/device-id", () => ({
  getDeviceId: () => "device-1",
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("ApiKeySettings OpenRouter UX", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("shows Connect action when OpenRouter is not connected", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/keys")) {
        return Promise.resolve(jsonResponse({ keys: [] }));
      }
      if (url.includes("/api/providers/openrouter/status")) {
        return Promise.resolve(jsonResponse({ state: "not_connected" }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    render(<ApiKeySettings isOpen onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
    });
  });

  it("shows Disconnect button and model selector when OpenRouter is connected", async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/keys")) {
        return Promise.resolve(
          jsonResponse({
            keys: [
              {
                provider: "openrouter",
                lastFour: "1234",
                createdAt: new Date().toISOString(),
                status: "connected",
              },
            ],
          }),
        );
      }
      if (url.includes("/api/providers/openrouter/status")) {
        return Promise.resolve(jsonResponse({ state: "connected" }));
      }
      return Promise.resolve(jsonResponse({}));
    }) as typeof fetch;

    render(<ApiKeySettings isOpen onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /disconnect/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^test$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /reconnect/i })).not.toBeInTheDocument();
      expect(screen.getByLabelText(/translation model/i)).toBeInTheDocument();
    });
  });
});
