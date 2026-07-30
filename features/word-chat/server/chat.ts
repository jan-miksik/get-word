import {
  OpenRouterChatError,
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
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
  OPENROUTER_MAX_ATTEMPTS,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  OPENROUTER_TIMEOUT_MS,
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
  runReservedWordChatCall,
} from "./usage";
import {
  WordChatReplyStreamError,
  WordChatReplyStreamParser,
} from "./reply-stream-parser";
import {
  COMMON_LANGUAGES,
  GOOGLE_TRANSLATE_LANGUAGES,
  normalizeLanguageCode,
} from "@/lib/i18n/languages";
import { LEARNING_LANGUAGE_VARIANTS } from "@/lib/language-variants";
import { isWordChatContentMode } from "../types";
import type {
  ChatTurnResult,
  WordChatAddressRegister,
  WordChatContentMode,
  WordChatLanguageLevel,
  WordChatMessage,
  WordChatSalutationGender,
} from "../types";
import { readAddressRegister, readLanguageLevel, readSalutationGender } from "../preferences";
import { toPlainItemText } from "../plainItemText";

const SUPPORTED_LANGUAGE_CODES = new Set(
  [...COMMON_LANGUAGES, ...GOOGLE_TRANSLATE_LANGUAGES, ...LEARNING_LANGUAGE_VARIANTS].map(
    (language) => normalizeLanguageCode(language.code),
  ),
);
const LANGUAGE_CODE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i;

function parseLanguageChange(value: unknown): ChatTurnResult["languageChange"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as { from?: unknown; to?: unknown };
  if (typeof candidate.from !== "string" || typeof candidate.to !== "string") return null;
  const rawFrom = candidate.from.trim();
  const rawTo = candidate.to.trim();
  // `normalizeLanguageCode` intentionally falls back to English for malformed
  // UI values. That is useful for rendering, but unsafe for an action: a model
  // typo must be rejected, never silently converted into a language change.
  if (!LANGUAGE_CODE_RE.test(rawFrom) || !LANGUAGE_CODE_RE.test(rawTo)) return null;
  const from = normalizeLanguageCode(rawFrom);
  const to = normalizeLanguageCode(rawTo);
  if (
    from === to ||
    !SUPPORTED_LANGUAGE_CODES.has(from) ||
    !SUPPORTED_LANGUAGE_CODES.has(to)
  ) {
    return null;
  }
  return { from, to };
}

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

type ChatTurnMetadata = Omit<ChatTurnResult, "reply">;

/**
 * Validate the fields that decide whether the chat can advance before exposing
 * its visible reply. A plausible sentence paired with incompatible metadata is
 * a malformed model result, not a harmless no-op: otherwise the learner sees a
 * promise to prepare a list and then nothing happens.
 */
function parseChatTurnMetadata(
  parsed: Record<string, unknown> | null,
  options: { requireProposal: boolean },
): ChatTurnMetadata {
  if (!parsed || typeof parsed.readyToPropose !== "boolean") {
    throw new OpenRouterChatError("Word chat returned invalid ready metadata.", true);
  }
  if (!Array.isArray(parsed.suggestions) || !parsed.suggestions.every((entry) => typeof entry === "string")) {
    throw new OpenRouterChatError("Word chat returned invalid suggestion metadata.", true);
  }

  const readyToPropose = parsed.readyToPropose;
  const contentMode = isWordChatContentMode(parsed.contentMode) ? parsed.contentMode : null;
  const rawContentModeIsNull = parsed.contentMode === null;
  const languageChange = parseLanguageChange(parsed.languageChange);
  const suggestions = parsed.suggestions.map((entry) => toPlainItemText(entry)).filter(Boolean).slice(0, 3);

  if (readyToPropose) {
    if (!contentMode || parsed.suggestions.length > 0 || parsed.languageChange !== null) {
      throw new OpenRouterChatError("Word chat returned inconsistent final-turn metadata.", true);
    }
  } else if (!rawContentModeIsNull) {
    throw new OpenRouterChatError("Word chat returned a content mode before the proposal was ready.", true);
  }

  if (options.requireProposal && !readyToPropose && !languageChange) {
    throw new OpenRouterChatError("Word chat did not finalize after its follow-up question.", true);
  }

  return { suggestions, readyToPropose, contentMode, languageChange };
}

function parseChatTurn(
  content: string,
  options: { requireProposal: boolean },
): ChatTurnResult {
  const parsed = parseJsonLoose(content) as Record<string, unknown> | null;
  const reply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) {
    throw new OpenRouterChatError("Word chat returned no reply.", true);
  }
  return { reply, ...parseChatTurnMetadata(parsed, options) };
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
  const request = {
    maxTokens: CHAT_MAX_TOKENS,
    reasoning: CHAT_REASONING,
    responseFormat: CHAT_RESPONSE_FORMAT,
    provider: WORD_CHAT_PROVIDER_PREFERENCES,
    messages,
  };
  const paid = await runReservedWordChatCall(
    {
      userId: input.userId,
      sessionId: input.sessionId,
      callType: "chat",
      stage: "started",
      model,
      request,
      maxOutputTokens: CHAT_MAX_TOKENS,
      maxAttempts: OPENROUTER_MAX_ATTEMPTS,
    },
    ({ onResponse, onAttemptStart }) =>
      callOpenRouterChatParsedWithMeta(
        {
          apiKey,
          model,
          apiUrl: OPENROUTER_API_URL,
          maxAttempts: OPENROUTER_MAX_ATTEMPTS,
          retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
          timeoutMs: OPENROUTER_TIMEOUT_MS,
          maxTokens: CHAT_MAX_TOKENS,
          reasoning: { ...CHAT_REASONING },
          responseFormat: CHAT_RESPONSE_FORMAT,
          provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
          messages,
          onResponse,
          onAttemptStart,
        },
        (content) =>
          parseChatTurn(content, {
            requireProposal: shouldForceProposal(input.messages),
          }),
      ),
  );
  const { value } = paid.result;
  const meta = paid.meta;

  await recordWordChatUsage({
    userId: input.userId,
    sessionId: input.sessionId,
    callType: "chat",
    stage: "started",
    model,
    meta,
    reservation: paid.reservation,
    minimumCostUsd: paid.minimumCostUsd,
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
    maxAttempts: OPENROUTER_MAX_ATTEMPTS,
  });

  return {
    async *[Symbol.asyncIterator]() {
      let lastError: OpenRouterChatError | null = null;
      const maxAttempts = Math.max(1, OPENROUTER_MAX_ATTEMPTS);
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

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const startedAt = Date.now();
        const parser = new WordChatReplyStreamParser();
        let fullContent = "";
        let emittedVisibleReply = false;

        try {
          const upstream = await streamOpenRouterCompletion({
            apiKey,
            model,
            apiUrl: OPENROUTER_API_URL,
            // Retry the whole streaming turn here so parser failures before the
            // first visible reply get a fresh model attempt. Once text has been
            // yielded to the learner, retrying would duplicate the answer.
            maxAttempts: 1,
            retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
            timeoutMs: OPENROUTER_TIMEOUT_MS,
            maxTokens: CHAT_MAX_TOKENS,
            reasoning: { ...CHAT_REASONING },
            responseFormat: CHAT_RESPONSE_FORMAT,
            provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
            messages,
            signal: input.signal,
            onResponse: (responseMeta) => responseMetas.push(responseMeta),
            onAttemptStart: () => {
              attemptCount += 1;
            },
          });

          for await (const event of upstream) {
            if (event.type === "delta") {
              fullContent += event.text;
              // Keep parsing the reply while it arrives, but do not expose it
              // until the complete JSON result passes its cross-field checks.
              // Providers do not guarantee object-property order, so validating
              // a metadata prefix before `reply` made otherwise valid replies
              // disappear whenever they emitted `reply` first.
              parser.feed(event.text);
              continue;
            }
          }

          let fallbackReply: string | null = null;
          let metadataValid = true;
          try {
            parser.finish();
          } catch (err) {
            const partialReply = parser.completeReply.trim();
            if (!partialReply) {
              if (err instanceof WordChatReplyStreamError) {
                throw new OpenRouterChatError(err.message, true);
              }
              throw err;
            }
            fallbackReply = partialReply;
            metadataValid = false;
          }

          let value: ChatTurnResult;
          if (metadataValid) {
            // A complete but inconsistent result is retryable and must never
            // materialize as a visible reply.
            value = parseChatTurn(fullContent, {
              requireProposal: shouldForceProposal(input.messages),
            });
          } else {
            try {
              value = parseChatTurn(fullContent, {
                requireProposal: shouldForceProposal(input.messages),
              });
            } catch {
              value = {
                reply: fallbackReply ?? parser.completeReply.trim(),
                suggestions: [],
                readyToPropose: false,
                contentMode: null,
                languageChange: null,
              };
            }
          }

          if (!value.reply.trim()) {
            throw new OpenRouterChatError("Word chat returned no reply.", true);
          }

          const diagnostics = buildCallDiagnostics({
            callType: "chat",
            model,
            meta: observedMeta(),
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
            meta: observedMeta(),
            reservation,
            minimumCostUsd: minimumCostUsd(),
          });

          // The transport remains an NDJSON stream, but this first visible
          // event only follows a valid complete result. It avoids a stuck empty
          // assistant bubble while preserving the metadata safety boundary.
          emittedVisibleReply = true;
          yield { type: "delta", text: value.reply };

          yield {
            type: "done",
            reply: value.reply,
            suggestions: value.suggestions,
            readyToPropose: value.readyToPropose,
            contentMode: value.contentMode,
            languageChange: value.languageChange,
            metadataValid,
            diagnostics,
          };
          return;
        } catch (err) {
          if (emittedVisibleReply) {
            const partialReply = parser.completeReply.trim();
            if (partialReply) {
              const diagnostics = buildCallDiagnostics({
                callType: "chat",
                model,
                meta: observedMeta(),
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
                meta: observedMeta(),
                reservation,
                minimumCostUsd: minimumCostUsd(),
              });
              yield {
                type: "done",
                reply: partialReply,
                suggestions: [],
                readyToPropose: false,
                contentMode: null,
                languageChange: null,
                metadataValid: false,
                diagnostics,
              };
              return;
            }
          }

          const retryableError =
            err instanceof OpenRouterChatError
              ? err
              : err instanceof WordChatReplyStreamError
                ? new OpenRouterChatError(err.message, true)
                : null;
          if (!retryableError || !retryableError.retryable || input.signal?.aborted) {
            if (responseMetas.length > 0) await recordObservedUsage();
            throw err;
          }
          lastError = retryableError;
          if (attempt >= maxAttempts - 1) break;
          await new Promise((resolve) =>
            setTimeout(resolve, OPENROUTER_RETRY_BASE_DELAY_MS * 2 ** attempt),
          );
        }
      }

      if (responseMetas.length > 0) await recordObservedUsage();
      throw lastError ?? new OpenRouterChatError("OpenRouter request failed.", true);
    },
  };
}
