import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deviceJsonFetch: vi.fn(),
}));

vi.mock("@/features/shared/http/device-json-fetch", () => ({
  deviceJsonFetch: mocks.deviceJsonFetch,
}));

import { WordChatApiError, sendChatMessageStream } from "../api";

function streamFromText(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("sendChatMessageStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes malformed stream payloads", async () => {
    mocks.deviceJsonFetch.mockResolvedValue({
      ok: true,
      body: streamFromText(["provider_internal_secret"]),
    });

    const promise = sendChatMessageStream(
      {
        sessionId: "session-1",
        languageFrom: "cs",
        languageTo: "vi",
        chatLanguage: "cs",
        addressRegister: "casual",
        salutationGender: "neutral",
        languageLevel: "A0",
        messages: [{ role: "user", content: "Kavárna" }],
      },
      { onDelta: vi.fn() },
    );

    await expect(promise).rejects.toMatchObject({
      code: "WORD_CHAT_TEMPORARY",
      message: "The word chat stream could not be read.",
    });
    await expect(promise).rejects.toBeInstanceOf(WordChatApiError);
  });

  it("reads a language-pair action from the completed stream", async () => {
    mocks.deviceJsonFetch.mockResolvedValue({
      ok: true,
      body: streamFromText([
        '{"type":"done","reply":"Switching languages.",',
        '"suggestions":[],"ready_to_propose":false,',
        '"language_change":{"from":"cs","to":"es"},',
        '"metadata_valid":true,"diagnostics":null}\n',
      ]),
    });

    const result = await sendChatMessageStream(
      {
        sessionId: "session-1",
        languageFrom: "fr",
        languageTo: "vi",
        chatLanguage: "en",
        addressRegister: "casual",
        salutationGender: null,
        languageLevel: "A0",
        messages: [{ role: "user", content: "I know Czech and want Spanish." }],
      },
      { onDelta: vi.fn() },
    );

    expect(result.language_change).toEqual({ from: "cs", to: "es" });
  });
});
