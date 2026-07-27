import {
  OpenRouterChatError,
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
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
import type { ChatTurnResult, WordChatMessage } from "../types";

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

  const system = buildChatSystemPrompt({
    languageFrom: input.languageFrom,
    languageTo: input.languageTo,
    chatLanguage: input.chatLanguage,
    brief: input.brief,
  });

  const messages = [
    { role: "system" as const, content: system },
    ...input.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

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
