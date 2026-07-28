import { describe, expect, it } from "vitest";
import { readNdjsonStream } from "../api";

function streamFromText(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readNdjsonStream", () => {
  it("handles split events, multiple events per chunk, crlf and no final newline", async () => {
    const events: unknown[] = [];

    await readNdjsonStream(
      streamFromText([
        '{"type":"delta","text":"A',
        '"}\r\n{"type":"delta","text":"B"}\n{"type":"done"',
        ',"reply":"AB"}',
      ]),
      (event) => events.push(event),
    );

    expect(events).toEqual([
      { type: "delta", text: "A" },
      { type: "delta", text: "B" },
      { type: "done", reply: "AB" },
    ]);
  });
});
