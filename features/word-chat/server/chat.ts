import {
  OpenRouterChatError,
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
  streamOpenRouterCompletion,
} from "@/lib/openrouter-chat";
import type { LearnerBrief } from "@/lib/learner-brief";
import {
  CHAT_MAX_TOKENS,
  MAX_USER_MESSAGE_CHARS,
  OPENROUTER_API_URL,
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  OPENROUTER_TIMEOUT_MS,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { buildChatSystemPrompt } from "./prompt";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import { recordWordChatUsage } from "./usage";
import {
  WordChatReplyStreamError,
  WordChatReplyStreamParser,
} from "./reply-stream-parser";
import type {
  ChatTurnResult,
  WordChatAddressRegister,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from "../types";
import { readAddressRegister, readLanguageLevel, readSalutationGender } from "../preferences";

export class WordChatUnavailableError extends Error {
  readonly code = "WORD_CHAT_UNAVAILABLE";
  constructor(message = "The word chat is unavailable right now.") {
    super(message);
    this.name = "WordChatUnavailableError";
  }
}

/** Trim and cap learner text before it reaches a prompt or the message history. */
export function sanitizeMessages(input: unknown): WordChatMessage[] {
  if (!Array.isArray(input)) return [];
  const messages: WordChatMessage[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_USER_MESSAGE_CHARS);
    if (!trimmed) continue;
    messages.push({ role, content: trimmed });
  }
  return messages;
}

export function sanitizeAddressRegister(input: unknown): WordChatAddressRegister {
  return readAddressRegister(input) ?? "formal";
}

export function sanitizeSalutationGender(input: unknown): WordChatSalutationGender | null {
  return readSalutationGender(input);
}

export function sanitizeLanguageLevel(input: unknown): WordChatLanguageLevel {
  return readLanguageLevel(input) ?? "A0";
}

function parseChatTurn(content: string): ChatTurnResult {
  const parsed = parseJsonLoose(content) as Record<string, unknown> | null;
  const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) {
    throw new OpenRouterChatError("Word chat returned no reply.", true);
  }
  const suggestions = Array.isArray(parsed?.suggestions)
    ? parsed.suggestions
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];
  return {
    reply,
    suggestions,
    readyToPropose: parsed?.readyToPropose === true,
  };
}

export type WordChatStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      reply: string;
      suggestions: string[];
      readyToPropose: boolean;
      metadataValid: boolean;
      diagnostics: WordChatCallDiagnostics;
    };

function buildChatRequest(input: {
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  addressRegister: WordChatAddressRegister;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel;
  brief: LearnerBrief | null;
  messages: WordChatMessage[];
}) {
  const system = buildChatSystemPrompt({
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    chatLanguage: input.chatLanguage,
    addressRegister: input.addressRegister,
    salutationGender: input.salutationGender,
    languageLevel: input.languageLevel,
    brief: input.brief,
  });

  return [
    { role: "system" as const, content: system },
    ...input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

/**
 * One chat turn. The caller has already reserved the turn against the rate
 * buckets; this only talks to the model and records what it cost.
 */
export async function runChatTurn(input: {
  userId: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  addressRegister: WordChatAddressRegister;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel;
  brief: LearnerBrief | null;
  messages: WordChatMessage[];
  /** Editor override from the debug panel; falls back to the configured model. */
  model?: string;
  /** Include the exact request in the diagnostics. Editors only. */
  includeRequest?: boolean;
}): Promise<ChatTurnResult & { diagnostics: WordChatCallDiagnostics }> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_CHAT_MODEL;
  const startedAt = Date.now();

  const messages = buildChatRequest(input);

  const { value, meta } = await callOpenRouterChatParsedWithMeta(
    {
      apiKey,
      model,
      apiUrl: OPENROUTER_API_URL,
      maxAttempts: OPENROUTER_MAX_ATTEMPTS,
      retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
      timeoutMs: OPENROUTER_TIMEOUT_MS,
      maxTokens: CHAT_MAX_TOKENS,
      responseFormat: { type: "json_object" },
      provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
      messages,
    },
    parseChatTurn,
  );

  await recordWordChatUsage({
    userId: input.userId,
    sessionId: input.sessionId,
    callType: "chat",
    stage: "started",
    model,
    meta,
  });

  return {
    ...value,
    diagnostics: buildCallDiagnostics({
      callType: "chat",
      model,
      meta,
      startedAt,
      ...(input.includeRequest
        ? {
            request: {
              maxTokens: CHAT_MAX_TOKENS,
              provider: WORD_CHAT_PROVIDER_PREFERENCES,
              messages,
            },
          }
        : {}),
    }),
  };
}

/**
 * Streaming variant of one chat turn. It yields visible reply text as soon as
 * the model starts filling the `reply` JSON string, then validates the complete
 * JSON object for suggestions and ready-to-propose metadata at the end.
 */
export async function streamChatTurn(input: {
  userId: string;
  sessionId: string;
  languageFrom: string;
  languageTo: string;
  chatLanguage: string;
  addressRegister: WordChatAddressRegister;
  salutationGender: WordChatSalutationGender | null;
  languageLevel: WordChatLanguageLevel;
  brief: LearnerBrief | null;
  messages: WordChatMessage[];
  model?: string;
  includeRequest?: boolean;
  signal?: AbortSignal;
}): Promise<AsyncIterable<WordChatStreamEvent>> {
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_CHAT_MODEL;
  const startedAt = Date.now();
  const messages = buildChatRequest(input);
  const upstream = await streamOpenRouterCompletion({
    apiKey,
    model,
    apiUrl: OPENROUTER_API_URL,
    maxAttempts: OPENROUTER_MAX_ATTEMPTS,
    retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
    timeoutMs: OPENROUTER_TIMEOUT_MS,
    maxTokens: CHAT_MAX_TOKENS,
    responseFormat: { type: "json_object" },
    provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
    messages,
    signal: input.signal,
  });

  return {
    async *[Symbol.asyncIterator]() {
      const parser = new WordChatReplyStreamParser();
      let fullContent = "";
      let meta = {};

      for await (const event of upstream) {
        if (event.type === "delta") {
          fullContent += event.text;
          for (const text of parser.feed(event.text)) {
            yield { type: "delta", text };
          }
          continue;
        }
        meta = event.meta;
      }

      try {
        parser.finish();
      } catch (err) {
        if (err instanceof WordChatReplyStreamError) throw new OpenRouterChatError(err.message, false);
        throw err;
      }

      let value: ChatTurnResult;
      let metadataValid = true;
      try {
        value = parseChatTurn(fullContent);
      } catch {
        metadataValid = false;
        value = {
          reply: parser.completeReply.trim(),
          suggestions: [],
          readyToPropose: false,
        };
      }

      const diagnostics = buildCallDiagnostics({
        callType: "chat",
        model,
        meta,
        startedAt,
        ...(input.includeRequest
          ? {
              request: {
                maxTokens: CHAT_MAX_TOKENS,
                provider: WORD_CHAT_PROVIDER_PREFERENCES,
                messages,
              },
            }
          : {}),
      });

      await recordWordChatUsage({
        userId: input.userId,
        sessionId: input.sessionId,
        callType: "chat",
        stage: "started",
        model,
        meta,
      });

      yield {
        type: "done",
        reply: value.reply,
        suggestions: value.suggestions,
        readyToPropose: value.readyToPropose,
        metadataValid,
        diagnostics,
      };
    },
  };
}
