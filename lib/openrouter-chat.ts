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

export class OpenRouterChatError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** HTTP status when the failure came from an OpenRouter API response. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterChatError";
  }

  /** OpenRouter returns 402 when the account/key has insufficient credits. */
  get isOutOfCredits(): boolean {
    return this.status === 402;
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
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let res: Response;
  try {
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
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenRouterChatError("OpenRouter request timed out.", true);
    }
    throw new OpenRouterChatError(
      err instanceof Error ? err.message : "OpenRouter request failed.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

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

  const data = await res.json().catch(() => null);
  const choice = data?.choices?.[0];

  // A truncated response cannot be reliably repaired: the JSON is cut mid-item.
  // Surface it as retryable so a fresh attempt (or smaller batch) can recover.
  if (choice?.finish_reason === "length") {
    throw new OpenRouterChatError(
      "OpenRouter response was truncated (hit token limit).",
      true,
    );
  }

  const content = choice?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new OpenRouterChatError("OpenRouter returned no content.", true);
  }
  return {
    content,
    meta: {
      id: typeof data?.id === "string" ? data.id : undefined,
      usage: data?.usage && typeof data.usage === "object"
        ? data.usage as Record<string, unknown>
        : undefined,
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
      if (!(err instanceof OpenRouterChatError) || !err.retryable) throw err;
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
