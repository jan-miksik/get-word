/**
 * Shared OpenRouter chat-completions client.
 *
 * Both translation paths use this:
 * - the donated server-key autogenerate flow
 *   (features/learning/onboarding/server/autogenerate-common-list/openrouter.ts)
 * - the BYOK list-translation flow (lib/translation.ts)
 *
 * It centralizes the reliability behavior we want everywhere: retry with
 * exponential backoff on transient failures, a hard request timeout, truncation
 * detection (finish_reason === "length"), and consistent error classification.
 */

const DEFAULT_OPENROUTER_API_URL =
  process.env.OPENROUTER_API_BASE_URL?.replace(/\/+$/, "")
    ? `${process.env.OPENROUTER_API_BASE_URL.replace(/\/+$/, "")}/chat/completions`
    : "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 600;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Whether the request reached OpenRouter at all.
 *
 * "transport" means no response was ever observed (timeout, aborted, socket
 * error), so the provider may or may not have processed the call. Everything
 * else — an HTTP error, a truncated body, an unusable payload — is a "response":
 * we know what happened. Callers that meter a shared budget need this
 * distinction to decide whether a failed call must still be charged.
 */
export type OpenRouterFailureKind = "transport" | "response";

export class OpenRouterChatError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** HTTP status when the failure came from an OpenRouter API response. */
    readonly status?: number,
    readonly kind: OpenRouterFailureKind = "response",
  ) {
    super(message);
    this.name = "OpenRouterChatError";
  }

  /** OpenRouter returns 402 when the account/key has insufficient credits. */
  get isOutOfCredits(): boolean {
    return this.status === 402;
  }
}

/** A successful provider response whose generated content cannot be consumed. */
export class OpenRouterContentError extends OpenRouterChatError {
  constructor(readonly reason: 'empty_content' | 'invalid_json' | 'truncated', message: string) {
    super(message, true);
    this.name = 'OpenRouterContentError';
  }
}

export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenRouterContentPart[];
};

export interface OpenRouterChatOptions {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  /** Passed through as `response_format` (e.g. json_object or strict json_schema). */
  responseFormat?: Record<string, unknown>;
  /** Unified OpenRouter reasoning control (enabled/effort/max_tokens/exclude). */
  reasoning?: Record<string, unknown>;
  /** Provider routing options, e.g. require_parameters for structured outputs. */
  provider?: Record<string, unknown>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  apiUrl?: string;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Called for every successful HTTP response before caller-specific parsing.
   * Server-key callers use this to retain usage from paid responses that are
   * later rejected as malformed and retried.
   */
  onResponse?: (meta: OpenRouterChatMeta) => void;
  /** Called immediately before each HTTP attempt, including retries. */
  onAttemptStart?: () => void;
}

// 402 = out of credits, 4xx (except the few below) = caller error: retrying
// those just wastes the attempt budget. Only transient conditions are retried.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export type OpenRouterChatMeta = {
  id?: string;
  usage?: Record<string, unknown>;
};

async function callOnce(options: OpenRouterChatOptions): Promise<{ content: string; meta: OpenRouterChatMeta }> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const cleanup = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  };
  let res: Response;
  try {
    options.onAttemptStart?.();
    res = await fetch(options.apiUrl ?? DEFAULT_OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { top_p: options.topP } : {}),
      }),
    });
  } catch (err) {
    cleanup();
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenRouterChatError("OpenRouter request timed out.", true, undefined, "transport");
    }
    throw new OpenRouterChatError(
      err instanceof Error ? err.message : "OpenRouter request failed.",
      true,
      undefined,
      "transport",
    );
  }

  try {
    if (!res.ok) {
      const detail = await res
        .text()
        .catch(() => `${res.status} ${res.statusText}`);
      throw new OpenRouterChatError(
        `OpenRouter API error: ${res.status} ${detail.slice(0, 200)}`,
        isRetryableStatus(res.status),
        res.status,
      );
    }

    const data = await res.json().catch((err: unknown) => {
      if (controller.signal.aborted) {
        throw new OpenRouterChatError("OpenRouter response body timed out.", true, undefined, "transport");
      }
      if (err instanceof SyntaxError) return null;
      throw new OpenRouterChatError("OpenRouter response body could not be read.", true, undefined, "transport");
    });
    const choice = data?.choices?.[0];
    const meta: OpenRouterChatMeta = {
      id: typeof data?.id === "string" ? data.id : undefined,
      usage: data?.usage && typeof data.usage === "object"
        ? data.usage as Record<string, unknown>
        : undefined,
    };
    options.onResponse?.(meta);

    // A truncated response cannot be reliably repaired: the JSON is cut mid-item.
    // Surface it as retryable so a fresh attempt (or smaller batch) can recover.
    if (choice?.finish_reason === "length") {
      throw new OpenRouterContentError("truncated", "OpenRouter response was truncated (hit token limit).");
    }

    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new OpenRouterContentError("empty_content", "OpenRouter returned no content.");
    }
    return {
      content,
      meta,
    };
  } finally {
    cleanup();
  }
}

export type OpenRouterStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; meta: OpenRouterChatMeta };

function parseStreamEvent(raw: string): OpenRouterStreamEvent[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "[DONE]") return trimmed === "[DONE]" ? [{ type: "done", meta: {} }] : [];

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new OpenRouterContentError("invalid_json", "OpenRouter stream returned malformed JSON.");
  }

  const payload = data as {
    id?: unknown;
    usage?: unknown;
    error?: unknown;
    choices?: {
      delta?: { content?: unknown };
      message?: { content?: unknown };
      finish_reason?: unknown;
    }[];
  };
  if (payload.error) {
    throw new OpenRouterChatError("OpenRouter stream returned an error.", true);
  }
  const meta: OpenRouterChatMeta = {
    id: typeof payload.id === "string" ? payload.id : undefined,
    usage: payload.usage && typeof payload.usage === "object"
      ? payload.usage as Record<string, unknown>
      : undefined,
  };

  const events: OpenRouterStreamEvent[] = [];
  for (const choice of payload.choices ?? []) {
    if (choice.finish_reason === "length") {
      throw new OpenRouterContentError("truncated", "OpenRouter stream was truncated (hit token limit).");
    }
    const content = choice.delta?.content ?? choice.message?.content;
    if (typeof content === "string" && content) {
      events.push({ type: "delta", text: content });
    }
    if (choice.finish_reason) {
      events.push({ type: "done", meta });
    }
  }
  if ((payload.choices ?? []).length === 0 && (meta.id || meta.usage)) {
    events.push({ type: "done", meta });
  }
  return events;
}

async function openStreamOnce(options: OpenRouterChatOptions): Promise<{
  response: Response;
  controller: AbortController;
  cleanup: () => void;
}> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const cleanup = () => {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromParent);
  };

  try {
    options.onAttemptStart?.();
    const response = await fetch(options.apiUrl ?? DEFAULT_OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        ...(options.reasoning ? { reasoning: options.reasoning } : {}),
        ...(options.provider ? { provider: options.provider } : {}),
        ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.topP != null ? { top_p: options.topP } : {}),
      }),
    });
    return { response, controller, cleanup };
  } catch (err) {
    cleanup();
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenRouterChatError("OpenRouter request timed out.", true, undefined, "transport");
    }
    throw new OpenRouterChatError(
      err instanceof Error ? err.message : "OpenRouter request failed.",
      true,
      undefined,
      "transport",
    );
  }
}

/**
 * Opens a streaming chat-completions response and yields only model text deltas
 * plus a final metadata event. This helper deliberately knows nothing about the
 * caller's JSON shape; route-specific code decides how to interpret the text.
 */
export async function streamOpenRouterCompletion(
  options: OpenRouterChatOptions,
): Promise<AsyncIterable<OpenRouterStreamEvent>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  let opened: Awaited<ReturnType<typeof openStreamOnce>> | null = null;
  let lastError: OpenRouterChatError | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    opened = await openStreamOnce(options);
    if (opened.response.ok) break;

    const detail = await opened.response
      .text()
      .catch(() => `${opened?.response.status} ${opened?.response.statusText}`);
    const error = new OpenRouterChatError(
      `OpenRouter API error: ${opened.response.status} ${detail.slice(0, 200)}`,
      isRetryableStatus(opened.response.status),
      opened.response.status,
    );
    opened.cleanup();
    if (!error.retryable) throw error;
    lastError = error;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelay * 2 ** attempt),
      );
    }
    opened = null;
  }

  if (!opened) throw lastError ?? new OpenRouterChatError("OpenRouter request failed.", true);
  if (!opened.response.body) {
    opened.cleanup();
    throw new OpenRouterChatError("OpenRouter stream had no response body.", true);
  }

  const response = opened.response;
  const controller = opened.controller;
  const cleanup = opened.cleanup;

  return {
    async *[Symbol.asyncIterator]() {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastMeta: OpenRouterChatMeta = {};
      let sawDone = false;

      const handleEventBlock = (block: string): OpenRouterStreamEvent[] => {
        const dataLines = block
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart());
        if (dataLines.length === 0) return [];
        const events = parseStreamEvent(dataLines.join("\n"));
        for (const event of events) {
          if (event.type === "done") {
            lastMeta = { ...lastMeta, ...event.meta, usage: event.meta.usage ?? lastMeta.usage };
            sawDone = true;
          }
        }
        return events.filter((event) => event.type !== "done");
      };

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            for (const event of handleEventBlock(block)) yield event;
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
          for (const event of handleEventBlock(buffer)) yield event;
        }
        if (sawDone) options.onResponse?.(lastMeta);
        yield { type: "done", meta: lastMeta };
      } catch (err) {
        if (err instanceof OpenRouterChatError) throw err;
        // Headers can arrive successfully before a socket fails or the body
        // times out. Give callers the same retry classification as fetch errors.
        throw new OpenRouterChatError("OpenRouter stream could not be read.", true, undefined, "transport");
      } finally {
        cleanup();
        if (!sawDone) controller.abort();
        reader.releaseLock();
      }
    },
  };
}

/**
 * Calls OpenRouter and parses the response, retrying transient failures with
 * exponential backoff. The `parse` callback runs inside the retry loop, so a
 * parser that throws a retryable OpenRouterChatError (e.g. malformed JSON or a
 * failed shape/alignment check) triggers a fresh attempt rather than failing
 * the whole request.
 */
export async function callOpenRouterChatParsed<T>(
  options: OpenRouterChatOptions,
  parse: (content: string) => T,
): Promise<T> {
  const result = await callOpenRouterChatParsedWithMeta(options, parse);
  return result.value;
}

export async function callOpenRouterChatParsedWithMeta<T>(
  options: OpenRouterChatOptions,
  parse: (content: string) => T,
): Promise<{ value: T; meta: OpenRouterChatMeta }> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;

  let lastError: OpenRouterChatError | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { content, meta } = await callOnce(options);
      return { value: parse(content), meta };
    } catch (err) {
      if (!(err instanceof OpenRouterChatError) || !err.retryable || options.signal?.aborted) throw err;
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelay * 2 ** attempt),
        );
      }
    }
  }
  throw lastError ?? new OpenRouterChatError("OpenRouter request failed.", true);
}

/**
 * Parses model JSON, tolerating a stray prose wrapper by extracting the first
 * top-level object/array block. Returns null when nothing parseable is found.
 */
export function parseJsonLoose(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/[[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
