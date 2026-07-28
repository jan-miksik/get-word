import { describe, expect, it } from "vitest";
import {
  WordChatReplyStreamError,
  WordChatReplyStreamParser,
} from "../reply-stream-parser";

function collect(chunks: string[], options?: ConstructorParameters<typeof WordChatReplyStreamParser>[0]) {
  const parser = new WordChatReplyStreamParser(options);
  const deltas: string[] = [];
  for (const chunk of chunks) deltas.push(...parser.feed(chunk));
  parser.finish();
  return { deltas, reply: parser.completeReply };
}

describe("WordChatReplyStreamParser", () => {
  it("streams reply when it is the first field", () => {
    const result = collect(['{"reply":"Ahoj",', '"suggestions":[]}']);

    expect(result.deltas.join("")).toBe("Ahoj");
    expect(result.reply).toBe("Ahoj");
  });

  it("finds reply after earlier top-level fields", () => {
    const result = collect(['{"suggestions":["x"],"reply":"Později"}']);

    expect(result.reply).toBe("Později");
  });

  it("decodes escapes and unicode surrogate pairs across chunks", () => {
    const result = collect([
      '{"reply":"Řekl \\"ahoj\\"\\\\',
      '\\n',
      '\\uD83D',
      '\\uDE00"}',
    ]);

    expect(result.reply).toBe('Řekl "ahoj"\\\n😀');
  });

  it("handles chunks split inside utf-8 characters after TextDecoder", () => {
    const bytes = new TextEncoder().encode('{"reply":"žluťoučký"}');
    const decoder = new TextDecoder();
    const chunks = [
      decoder.decode(bytes.slice(0, 12), { stream: true }),
      decoder.decode(bytes.slice(12), { stream: true }) + decoder.decode(),
    ];

    expect(collect(chunks).reply).toBe("žluťoučký");
  });

  it("rejects missing, non-string, empty and unterminated replies", () => {
    expect(() => collect(['{"suggestions":[]}'])).toThrow(WordChatReplyStreamError);
    expect(() => collect(['{"reply":12}'])).toThrow(WordChatReplyStreamError);
    expect(() => collect(['{"reply":"   "}'])).toThrow(WordChatReplyStreamError);
    expect(() => collect(['{"reply":"nedokončeno'])).toThrow(WordChatReplyStreamError);
  });

  it("rejects invalid surrogate pairs", () => {
    expect(() => collect(['{"reply":"\\uD83D"}'])).toThrow(WordChatReplyStreamError);
    expect(() => collect(['{"reply":"\\uD83D! "}'])).toThrow(WordChatReplyStreamError);
    expect(() => collect(['{"reply":"\\uDE00"}'])).toThrow(WordChatReplyStreamError);
  });

  it("enforces output limits", () => {
    expect(() => collect(['{"reply":"abc"}'], { maxReplyChars: 2 })).toThrow(
      WordChatReplyStreamError,
    );
    expect(() => collect(['{"reply":"abc"}'], { maxUpstreamChars: 5 })).toThrow(
      WordChatReplyStreamError,
    );
  });
});
