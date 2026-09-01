import { OpenRouterChatError, parseJsonLoose } from "@/lib/openrouter-chat";
import { bundledMessages, enMessages } from "@/lib/i18n/messages";
import { COMMON_LANGUAGES, GOOGLE_TRANSLATE_LANGUAGES, normalizeLanguageCode } from "@/lib/i18n/languages";
import { LEARNING_LANGUAGE_VARIANTS } from "@/lib/language-variants";
import { isWordChatContentMode, type ChatTurnResult } from "../types";
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

/** Only format failures may degrade to local recovery, never auth/budget errors. */
export class WordChatFormatError extends OpenRouterChatError {
  constructor(readonly reason: string) {
    super(`Word chat response format: ${reason}.`, true);
    this.name = "WordChatFormatError";
  }
}

function localized(language: string, key: "wordChat.proposalHandoff" | "wordChat.formatRecovery") {
  return bundledMessages[language]?.[key] ?? enMessages[key];
}

/** No AI interpretation, language change, or paid proposal is implied by this reply. */
export function buildChatRecovery(chatLanguage: string): ChatTurnResult {
  return {
    reply: localized(chatLanguage, "wordChat.formatRecovery"),
    readyToPropose: false, contentMode: null, suggestions: [], languageChange: null,
    recoveryRequired: true,
  };
}

function field(parsed: Record<string, unknown>, camel: string, snake: string): unknown {
  if (camel in parsed && snake in parsed && JSON.stringify(parsed[camel]) !== JSON.stringify(parsed[snake])) {
    throw new WordChatFormatError(`conflicting_${camel}`);
  }
  return camel in parsed ? parsed[camel] : parsed[snake];
}

/** Validate actions strictly; normalize known wire-format drift without another model call. */
export function parseChatTurn(
  content: string,
  options: { requireProposal: boolean; chatLanguage: string },
): ChatTurnResult {
  if (content.length > 32_000) throw new WordChatFormatError("response_too_large");
  const raw = parseJsonLoose(content);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new WordChatFormatError("expected_object");
  const parsed = raw as Record<string, unknown>;
  const rawReady = field(parsed, "readyToPropose", "ready_to_propose");
  const rawMode = field(parsed, "contentMode", "content_mode");
  const rawLanguage = field(parsed, "languageChange", "language_change");
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (reply.length > 8_000) throw new WordChatFormatError("reply_too_large");

  // Missing and invalid are not equivalent to null: an absent action could
  // conceal a requested language change. Never silently propose for the old pair.
  if (rawLanguage === undefined) throw new WordChatFormatError("missing_language_action");
  const languageChange = parseLanguageChange(rawLanguage);
  if (rawLanguage !== null && !languageChange) throw new WordChatFormatError("invalid_language_action");
  if (languageChange) {
    if (!reply) throw new WordChatFormatError("missing_language_reply");
    return { reply, languageChange, readyToPropose: false, contentMode: null, suggestions: [] };
  }

  const ready = typeof rawReady === "boolean" ? rawReady
    : typeof rawReady === "string" && /^(true|false)$/i.test(rawReady.trim())
      ? rawReady.trim().toLowerCase() === "true" : undefined;
  if (rawReady != null && ready === undefined) throw new WordChatFormatError("invalid_ready_type");
  if (ready === undefined && !options.requireProposal) return buildChatRecovery(options.chatLanguage);
  const readyToPropose = ready === true || options.requireProposal;
  if (!readyToPropose && !reply) throw new WordChatFormatError("missing_reply");
  const useHandoff = readyToPropose && (ready !== true || !reply);
  if (useHandoff || typeof rawReady !== "boolean" || (readyToPropose && !isWordChatContentMode(rawMode))) {
    // Field types, never raw model output or user text, make future drift diagnosable.
    console.warn("[word-chat] repaired turn metadata", {
      readyType: rawReady === undefined ? "missing" : typeof rawReady,
      replyType: typeof parsed.reply,
      forcedProposal: options.requireProposal && ready !== true,
      defaultedContentMode: readyToPropose && !isWordChatContentMode(rawMode),
    });
  }
  return {
    reply: useHandoff ? localized(options.chatLanguage, "wordChat.proposalHandoff") : reply,
    readyToPropose,
    contentMode: readyToPropose ? isWordChatContentMode(rawMode) ? rawMode : "mixed" : null,
    suggestions: readyToPropose ? [] : Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((entry): entry is string => typeof entry === "string")
          .map(toPlainItemText).filter(Boolean).slice(0, 3) : [],
    languageChange: null,
  };
}
