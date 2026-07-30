export class WordChatReplyStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WordChatReplyStreamError";
  }
}

type ParserPhase =
  | "start"
  | "keyOrEnd"
  | "key"
  | "afterKey"
  | "beforeValue"
  | "reply"
  | "skipValue"
  | "afterValue"
  | "done";

const DEFAULT_MAX_UPSTREAM_CHARS = 16_000;
const DEFAULT_MAX_REPLY_CHARS = 2_000;

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function isHex(char: string): boolean {
  return /^[0-9a-fA-F]$/.test(char);
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

class JsonStringReader {
  private escaping = false;
  private unicode: string | null = null;
  private pendingHighSurrogate: number | null = null;
  private closed = false;

  constructor(private readonly onText: (text: string) => void) {}

  get done(): boolean {
    return this.closed;
  }

  feed(char: string): void {
    if (this.closed) throw new WordChatReplyStreamError("JSON string already closed.");

    if (this.unicode !== null) {
      if (!isHex(char)) throw new WordChatReplyStreamError("Invalid unicode escape.");
      this.unicode += char;
      if (this.unicode.length === 4) {
        this.emitCodeUnit(Number.parseInt(this.unicode, 16));
        this.unicode = null;
        this.escaping = false;
      }
      return;
    }

    if (this.escaping) {
      if (char === "u") {
        this.unicode = "";
        return;
      }
      if (this.pendingHighSurrogate !== null) {
        throw new WordChatReplyStreamError("Invalid unicode surrogate pair.");
      }
      const escaped: Record<string, string> = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      const text = escaped[char];
      if (text === undefined) throw new WordChatReplyStreamError("Invalid JSON escape.");
      this.onText(text);
      this.escaping = false;
      return;
    }

    if (char === "\\") {
      this.escaping = true;
      return;
    }
    if (char === '"') {
      if (this.pendingHighSurrogate !== null) {
        throw new WordChatReplyStreamError("Incomplete unicode surrogate pair.");
      }
      this.closed = true;
      return;
    }
    if (this.pendingHighSurrogate !== null) {
      throw new WordChatReplyStreamError("Invalid unicode surrogate pair.");
    }
    this.onText(char);
  }

  finish(): void {
    if (this.unicode !== null || this.escaping || this.pendingHighSurrogate !== null || !this.closed) {
      throw new WordChatReplyStreamError("Unterminated JSON string.");
    }
  }

  private emitCodeUnit(code: number): void {
    if (isHighSurrogate(code)) {
      if (this.pendingHighSurrogate !== null) {
        throw new WordChatReplyStreamError("Invalid unicode surrogate pair.");
      }
      this.pendingHighSurrogate = code;
      return;
    }
    if (isLowSurrogate(code)) {
      if (this.pendingHighSurrogate === null) {
        throw new WordChatReplyStreamError("Invalid unicode surrogate pair.");
      }
      const high = this.pendingHighSurrogate;
      this.pendingHighSurrogate = null;
      const codePoint = 0x10000 + ((high - 0xd800) << 10) + (code - 0xdc00);
      this.onText(String.fromCodePoint(codePoint));
      return;
    }
    if (this.pendingHighSurrogate !== null) {
      throw new WordChatReplyStreamError("Invalid unicode surrogate pair.");
    }
    this.onText(String.fromCharCode(code));
  }
}

class JsonValueSkipper {
  private started = false;
  private primitive = false;
  private string = false;
  private rootString = false;
  private escaping = false;
  private unicodeRemaining = 0;
  private depth = 0;
  private complete = false;

  feed(char: string): { done: boolean; delimiter?: string } {
    if (this.complete) return { done: true, delimiter: char };
    if (!this.started) {
      if (isWhitespace(char)) return { done: false };
      this.started = true;
      if (char === '"') {
        this.string = true;
        this.rootString = true;
        return { done: false };
      }
      if (char === "{" || char === "[") {
        this.depth = 1;
        return { done: false };
      }
      this.primitive = true;
    }

    if (this.rootString && this.string) {
      this.feedStringChar(char);
      if (!this.string) {
        this.complete = true;
        return { done: true };
      }
      return { done: false };
    }

    if (this.depth > 0) {
      if (this.escaping || this.unicodeRemaining > 0) {
        this.feedStringChar(char);
        return { done: false };
      }
      if (this.string) {
        this.feedStringChar(char);
        return { done: false };
      }
      if (char === '"') {
        this.string = true;
        this.rootString = false;
        return { done: false };
      }
      if (char === "{" || char === "[") this.depth += 1;
      else if (char === "}" || char === "]") this.depth -= 1;
      if (this.depth === 0) {
        this.complete = true;
        return { done: true };
      }
      return { done: false };
    }

    if (this.primitive && (char === "," || char === "}" || isWhitespace(char))) {
      this.complete = true;
      return { done: true, delimiter: char === "," || char === "}" ? char : undefined };
    }

    return { done: false };
  }

  finish(): void {
    if (this.string || this.escaping || this.unicodeRemaining > 0 || this.depth > 0) {
      throw new WordChatReplyStreamError("Unterminated JSON value.");
    }
    if (!this.started) throw new WordChatReplyStreamError("Missing JSON value.");
  }

  private feedStringChar(char: string): void {
    if (this.unicodeRemaining > 0) {
      if (!isHex(char)) throw new WordChatReplyStreamError("Invalid unicode escape.");
      this.unicodeRemaining -= 1;
      if (this.unicodeRemaining === 0) this.escaping = false;
      return;
    }
    if (this.escaping) {
      if (char === "u") {
        this.unicodeRemaining = 4;
        return;
      }
      this.escaping = false;
      return;
    }
    if (char === "\\") {
      this.escaping = true;
      return;
    }
    if (char === '"') {
      this.string = false;
    }
  }
}

export class WordChatReplyStreamParser {
  private phase: ParserPhase = "start";
  private keyReader: JsonStringReader | null = null;
  private replyReader: JsonStringReader | null = null;
  private skipper: JsonValueSkipper | null = null;
  private currentKey = "";
  private reply = "";
  private emittedReply = false;
  private upstreamChars = 0;

  constructor(
    private readonly options: {
      maxUpstreamChars?: number;
      maxReplyChars?: number;
    } = {},
  ) {}

  get completeReply(): string {
    return this.reply;
  }

  get replyClosed(): boolean {
    return this.emittedReply && this.phase !== "reply";
  }

  feed(chunk: string): string[] {
    this.upstreamChars += chunk.length;
    if (this.upstreamChars > (this.options.maxUpstreamChars ?? DEFAULT_MAX_UPSTREAM_CHARS)) {
      throw new WordChatReplyStreamError("Model output was too large.");
    }

    let delta = "";
    const emit = (text: string) => {
      this.reply += text;
      if (this.reply.length > (this.options.maxReplyChars ?? DEFAULT_MAX_REPLY_CHARS)) {
        throw new WordChatReplyStreamError("Reply was too long.");
      }
      delta += text;
    };

    for (const char of chunk) {
      this.processChar(char, emit);
    }

    return delta ? [delta] : [];
  }

  finish(): void {
    if (this.replyReader && !this.replyReader.done) this.replyReader.finish();
    if (this.skipper) this.skipper.finish();
    if (!this.emittedReply) throw new WordChatReplyStreamError("Reply was missing.");
    if (this.phase === "reply") throw new WordChatReplyStreamError("Reply was incomplete.");
    if (!this.reply.trim()) throw new WordChatReplyStreamError("Reply was empty.");
  }

  private processChar(char: string, emit: (text: string) => void): void {
    if (this.phase === "start") {
      if (isWhitespace(char)) return;
      if (char !== "{") throw new WordChatReplyStreamError("Expected JSON object.");
      this.phase = "keyOrEnd";
      return;
    }

    if (this.phase === "keyOrEnd") {
      if (isWhitespace(char)) return;
      if (char === "}") {
        this.phase = "done";
        return;
      }
      if (char !== '"') throw new WordChatReplyStreamError("Expected JSON object key.");
      this.currentKey = "";
      this.keyReader = new JsonStringReader((text) => {
        this.currentKey += text;
      });
      this.phase = "key";
      return;
    }

    if (this.phase === "key") {
      if (!this.keyReader) throw new WordChatReplyStreamError("Missing key reader.");
      this.keyReader.feed(char);
      if (this.keyReader.done) {
        this.keyReader = null;
        this.phase = "afterKey";
      }
      return;
    }

    if (this.phase === "afterKey") {
      if (isWhitespace(char)) return;
      if (char !== ":") throw new WordChatReplyStreamError("Expected JSON key separator.");
      this.phase = "beforeValue";
      return;
    }

    if (this.phase === "beforeValue") {
      if (isWhitespace(char)) return;
      if (this.currentKey === "reply") {
        if (char !== '"') throw new WordChatReplyStreamError("Reply was not a string.");
        this.emittedReply = true;
        this.replyReader = new JsonStringReader(emit);
        this.phase = "reply";
        return;
      }
      this.skipper = new JsonValueSkipper();
      this.phase = "skipValue";
      this.processChar(char, emit);
      return;
    }

    if (this.phase === "reply") {
      if (!this.replyReader) throw new WordChatReplyStreamError("Missing reply reader.");
      this.replyReader.feed(char);
      if (this.replyReader.done) {
        this.replyReader = null;
        this.phase = "afterValue";
      }
      return;
    }

    if (this.phase === "skipValue") {
      if (!this.skipper) throw new WordChatReplyStreamError("Missing value skipper.");
      const result = this.skipper.feed(char);
      if (result.done) {
        this.skipper = null;
        this.phase = "afterValue";
        if (result.delimiter) this.processChar(result.delimiter, emit);
      }
      return;
    }

    if (this.phase === "afterValue") {
      if (isWhitespace(char)) return;
      if (char === ",") {
        this.phase = "keyOrEnd";
        return;
      }
      if (char === "}") {
        this.phase = "done";
        return;
      }
      throw new WordChatReplyStreamError("Expected JSON value delimiter.");
    }

    if (this.phase === "done") {
      if (isWhitespace(char)) return;
      throw new WordChatReplyStreamError("Unexpected text after JSON object.");
    }
  }

}
