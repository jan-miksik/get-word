/**
 * Per-item "study note" comment shown on the learning card.
 *
 * Stored as JSONB on `word_list_items.comment` (NOT `notes`, which is reserved
 * for the legacy `en:` helper-language hack). The shape is versioned so future
 * JSONB migrations are detectable, and carries `source` provenance so manual
 * comments are protected explicitly across re-translate / fork / regenerate.
 *
 * The validator is hand-rolled in the deterministic style of
 * `lib/translation-validate.ts` (the project has no Zod). It is intentionally
 * forgiving for `source: "manual"` (trim over-long text) and strict for
 * `source: "generated"` (drop, never repair).
 */

export type WordItemCommentSource = "manual" | "generated";

export type WordItemCommentMentionLanguage = "from" | "to";

export type WordItemCommentMention = {
  word: string;
  /** Which side of the pair the word/frequency refers to (disambiguates the chip). */
  language: WordItemCommentMentionLanguage;
  /** Spoken frequency: 3 = very common, 2 = occasional, 1 = rare. */
  frequency: 1 | 2 | 3;
};

export type WordItemComment = {
  /** Future-proofs JSONB migrations. Must be exactly 1; unknown → dropped. */
  version: 1;
  text: string;
  source: WordItemCommentSource;
  /** ISO timestamp; set ONLY for source:"manual"; used for manual-vs-manual conflict. */
  editedAt?: string;
  mentions?: WordItemCommentMention[];
};

export const COMMENT_VERSION = 1 as const;
/** Manual text longer than this is trimmed; generated text longer is dropped. */
export const MAX_COMMENT_TEXT_LENGTH = 240;
const MAX_MENTION_WORD_LENGTH = 60;
const MAX_MENTIONS = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMention(value: unknown): WordItemCommentMention | null {
  if (!isPlainObject(value)) return null;
  const rawWord = value.word;
  if (typeof rawWord !== "string") return null;
  const word = rawWord.trim();
  if (!word || word.length > MAX_MENTION_WORD_LENGTH) return null;

  const language = value.language;
  if (language !== "from" && language !== "to") return null;

  const frequency = value.frequency;
  if (frequency !== 1 && frequency !== 2 && frequency !== 3) return null;

  return { word, language, frequency };
}

function normalizeMentions(value: unknown): WordItemCommentMention[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mentions: WordItemCommentMention[] = [];
  for (const entry of value) {
    const mention = normalizeMention(entry);
    if (mention) mentions.push(mention);
    if (mentions.length >= MAX_MENTIONS) break;
  }
  return mentions.length > 0 ? mentions : undefined;
}

/**
 * Validate + normalize a raw comment value into a clean `WordItemComment`, or
 * `null` when it should be dropped. Runs on save (POST /api/sync, editor),
 * generation attach, and hydrate (defensive).
 *
 * - `version` must be exactly 1 (missing/unknown → dropped).
 * - `text` non-empty after trim. Over-long: manual → trimmed to 240;
 *   generated → dropped entirely.
 * - `editedAt` kept only for source:"manual"; stripped for generated.
 * - Invalid generated comments are dropped, not repaired.
 */
export function normalizeWordItemComment(value: unknown): WordItemComment | null {
  if (!isPlainObject(value)) return null;
  if (value.version !== COMMENT_VERSION) return null;

  const source = value.source;
  if (source !== "manual" && source !== "generated") return null;

  if (typeof value.text !== "string") return null;
  const trimmed = value.text.trim();
  if (!trimmed) return null;

  let text = trimmed;
  if (text.length > MAX_COMMENT_TEXT_LENGTH) {
    if (source === "generated") return null;
    text = text.slice(0, MAX_COMMENT_TEXT_LENGTH).trim();
    if (!text) return null;
  }

  const comment: WordItemComment = {
    version: COMMENT_VERSION,
    text,
    source,
  };

  if (source === "manual" && typeof value.editedAt === "string") {
    const ms = Date.parse(value.editedAt);
    if (Number.isFinite(ms)) comment.editedAt = new Date(ms).toISOString();
  }

  const mentions = normalizeMentions(value.mentions);
  if (mentions) comment.mentions = mentions;

  return comment;
}

/** Build a manual comment from raw editor text. Returns null when empty. */
export function makeManualComment(
  text: string,
  mentions?: WordItemCommentMention[],
): WordItemComment | null {
  return normalizeWordItemComment({
    version: COMMENT_VERSION,
    text,
    source: "manual",
    editedAt: new Date().toISOString(),
    mentions,
  });
}

/**
 * Conflict resolution for two comments competing for the same item.
 * - manual beats generated
 * - between two manual comments the newer `editedAt` wins
 * - between two generated comments the incoming one wins (caller orders by
 *   newest server/item update)
 */
export function pickWinningComment(
  existing: WordItemComment | null,
  incoming: WordItemComment | null,
): WordItemComment | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing.source === "manual" && incoming.source === "generated") return existing;
  if (existing.source === "generated" && incoming.source === "manual") return incoming;
  if (existing.source === "manual" && incoming.source === "manual") {
    const existingMs = existing.editedAt ? Date.parse(existing.editedAt) : 0;
    const incomingMs = incoming.editedAt ? Date.parse(incoming.editedAt) : 0;
    return incomingMs >= existingMs ? incoming : existing;
  }
  // Both generated.
  return incoming;
}

/**
 * Stable, content-derived hash of comment text. Used by the card's local
 * collapse override so an edited note discards a stale collapse of the old
 * text. Tiny FNV-1a — collision risk is irrelevant for this UI-only purpose.
 */
export function hashCommentText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
