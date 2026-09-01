import {
  OpenRouterChatError,
  OpenRouterContentError,
  callOpenRouterChatParsedWithMeta,
  streamOpenRouterCompletion,
} from "@/lib/openrouter-chat";
import type { LearnerBrief } from "@/lib/learner-brief";
import {
  CHAT_MAX_TOKENS,
  CHAT_REASONING,
  CHAT_RESPONSE_FORMAT,
  MAX_MESSAGES_PER_SESSION,
  MAX_USER_MESSAGE_CHARS,
  OPENROUTER_API_URL,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  CHAT_ATTEMPT_TIMEOUT_MS,
  CHAT_MAX_ATTEMPTS,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { buildChatSystemPrompt } from "./prompt";
import { buildCallDiagnostics, type WordChatCallDiagnostics } from "./diagnostics";
import {
  aggregateWordChatUsage,
  recordWordChatUsage,
  reserveWordChatSpend,
} from "./usage";
import { WordChatReplyStreamParser, WordChatReplyStreamError } from "./reply-stream-parser";
import { parseChatTurn, buildChatRecovery, WordChatFormatError } from "./chat-response";
import type {
  ChatTurnResult,
  WordChatAddressRegister,
  WordChatContentMode,
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
  // One turn normally contributes a user and an assistant message. A direct
  // API caller must not be able to submit an unbounded transcript and turn one
  // metered request into an unbounded prompt.
  return messages.slice(-(MAX_MESSAGES_PER_SESSION * 2));
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

/**
 * The chat is allowed one follow-up question, and the prompt says so — but a
 * model that keeps interviewing costs the learner turns they never asked for.
 * By the time a second learner message is in the transcript, the answer to that
 * one question is in, so the next step is the proposal whatever the model
 * decided. Proposed items are reviewed and removed one screen later, so an
 * early proposal is recoverable; another question is not.
 *
 * A turn that changes the study language is exempt: it is a settings change,
 * not an answer, and proposing on it would generate words for the pair the
 * learner just left.
 */
function shouldForceProposal(messages: WordChatMessage[]): boolean {
  return messages.filter((message) => message.role === "user").length >= 2;
}

export type WordChatStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      reply: string;
      suggestions: string[];
      readyToPropose: boolean;
      contentMode: WordChatContentMode | null;
      languageChange: ChatTurnResult["languageChange"];
      metadataValid: boolean;
      recoveryRequired?: boolean;
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

type ChatTurnInput = {
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
  signal?: AbortSignal;
};

/** Buffered and streaming HTTP share exactly the same parser and final fallback. */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult & { diagnostics: WordChatCallDiagnostics }> {
  for await (const event of await executeChatTurn(input, false)) {
    if (event.type === "done") {
      return {
        reply: event.reply, suggestions: event.suggestions,
        readyToPropose: event.readyToPropose, contentMode: event.contentMode,
        languageChange: event.languageChange, diagnostics: event.diagnostics,
        ...(event.recoveryRequired ? { recoveryRequired: true } : {}),
      };
    }
  }
  throw new OpenRouterChatError("Word chat returned no result.", true);
}

export function streamChatTurn(input: ChatTurnInput): Promise<AsyncIterable<WordChatStreamEvent>> {
  return executeChatTurn(input, true);
}

async function executeChatTurn(input: ChatTurnInput, streamFirst: boolean): Promise<AsyncIterable<WordChatStreamEvent>> {
  input.signal?.throwIfAborted();
  const apiKey = getServerApiKey();
  if (!apiKey) throw new WordChatUnavailableError();

  const model = input.model || WORD_CHAT_CHAT_MODEL;
  const messages = buildChatRequest(input);
  const reservation = await reserveWordChatSpend({
    userId: input.userId,
    sessionId: input.sessionId,
    callType: "chat",
    stage: "started",
    model,
    request: {
      maxTokens: CHAT_MAX_TOKENS,
      reasoning: CHAT_REASONING,
      responseFormat: CHAT_RESPONSE_FORMAT,
      provider: WORD_CHAT_PROVIDER_PREFERENCES,
      messages,
    },
    maxOutputTokens: CHAT_MAX_TOKENS,
    maxAttempts: CHAT_MAX_ATTEMPTS,
  });

  return {
    async *[Symbol.asyncIterator]() {
      let lastError: OpenRouterChatError | null = null;
      const maxAttempts = Math.max(1, CHAT_MAX_ATTEMPTS);
      const responseMetas: import("@/lib/openrouter-chat").OpenRouterChatMeta[] = [];
      let attemptCount = 0;
      const observedMeta = () => aggregateWordChatUsage(responseMetas);
      const minimumCostUsd = () => {
        const observedAttempts = responseMetas.filter((meta) => meta.usage).length;
        const unknownAttempts = Math.max(0, attemptCount - observedAttempts);
        return (
          (reservation.reservedUsd * unknownAttempts) /
          reservation.maxAttempts
        );
      };
      const recordObservedUsage = () =>
        recordWordChatUsage({
          userId: input.userId,
          sessionId: input.sessionId,
          callType: "chat",
          stage: "started",
          model,
          meta: observedMeta(),
          reservation,
          minimumCostUsd: minimumCostUsd(),
        });

      const startedAt = Date.now();
      let value: ChatTurnResult | null = null;
      try {
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          input.signal?.throwIfAborted();
          const options = {
            apiKey, model, messages,
            apiUrl: OPENROUTER_API_URL,
            maxAttempts: 1,
            timeoutMs: CHAT_ATTEMPT_TIMEOUT_MS,
            maxTokens: CHAT_MAX_TOKENS,
            reasoning: { ...CHAT_REASONING },
            responseFormat: CHAT_RESPONSE_FORMAT,
            provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
            signal: input.signal,
            onResponse: (meta: import("@/lib/openrouter-chat").OpenRouterChatMeta) => responseMetas.push(meta),
            onAttemptStart: () => { attemptCount += 1; },
          };
          const parse = (content: string) => parseChatTurn(content, {
            requireProposal: shouldForceProposal(input.messages),
            chatLanguage: input.chatLanguage,
          });
          try {
            if (streamFirst && attempt === 0) {
              const upstream = await streamOpenRouterCompletion(options);
              const parser = new WordChatReplyStreamParser({ maxReplyChars: 8_000, maxUpstreamChars: 32_000 });
              let content = "";
              for await (const event of upstream) {
                if (event.type === "delta") { content += event.text; parser.feed(event.text); }
              }
              parser.finish();
              value = parse(content);
            } else {
              // A broken provider stream gets a buffered completion, inside
              // the same spend reservation and turn allowance.
              value = (await callOpenRouterChatParsedWithMeta(options, parse)).value;
            }
            input.signal?.throwIfAborted();
            break;
          } catch (error) {
            const err = error instanceof WordChatReplyStreamError
              ? new WordChatFormatError("stream_json")
              : error instanceof OpenRouterContentError ? new WordChatFormatError(error.reason) : error;
            if (!(err instanceof OpenRouterChatError) || !err.retryable || input.signal?.aborted) throw err;
            lastError = err;
            console.warn("[word-chat] chat attempt failed", {
              attempt: attempt + 1, model, kind: err.kind, status: err.status,
            });
            if (attempt < maxAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, OPENROUTER_RETRY_BASE_DELAY_MS));
            }
          }
        }
        if (!value && lastError instanceof WordChatFormatError) {
          // A second malformed model response must not end onboarding. This
          // local reply cannot navigate; the learner explicitly chooses next.
          console.warn("[word-chat] using local chat recovery", { model, reason: lastError.reason });
          value = buildChatRecovery(input.chatLanguage);
        }
        if (!value) throw lastError ?? new OpenRouterChatError("OpenRouter request failed.", true);
      } catch (err) {
        // Unknown-cost attempts retain their conservative reservation. A
        // metering failure is never retried as another paid model request.
        if (responseMetas.length > 0) await recordObservedUsage();
        throw err;
      }
      await recordObservedUsage();
      const diagnostics = buildCallDiagnostics({
        callType: "chat", model, meta: observedMeta(), startedAt,
        ...(input.includeRequest ? { request: {
          maxTokens: CHAT_MAX_TOKENS,
          provider: WORD_CHAT_PROVIDER_PREFERENCES,
          messages,
        } } : {}),
      });
      yield { type: "delta", text: value.reply };
      yield { type: "done", ...value, metadataValid: true, diagnostics };
    },
  };
}
