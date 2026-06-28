/**
 * Optional per-item study-note comment generation.
 *
 * Runs as a SEPARATE pass from translation (not bolted onto the translation
 * call) so the translation output token budget is never at risk of truncation,
 * and a comment-gen failure leaves translations intact.
 *
 * Best-effort: the client-triggered editor endpoint treats failures silently.
 * Output is validated/normalized via lib/word-item-comment.ts; invalid
 * generated comments are dropped, never repaired.
 */

import {
  callOpenRouterChatParsed,
  OpenRouterChatError,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import {
  COMMENT_GENERATION_RULES,
  COMMENT_SYSTEM_PROMPT,
} from "@/lib/translation-prompt";
import {
  normalizeWordItemComment,
  type WordItemComment,
  type WordItemCommentMention,
} from "@/lib/word-item-comment";

export type CommentSourceItem = {
  /** Stable index used only for the prompt round-trip. */
  sourceIndex: number;
  known: string;
  target: string;
};

export type GeneratedComment = {
  sourceIndex: number;
  text: string;
  mentions?: WordItemCommentMention[];
};

/**
 * Batch size for the comment pass. Comment output is sparse (most items get no
 * note), so a large batch rarely approaches the output-token ceiling, and seeing
 * more of the list at once helps the model spot teaching-anchor mismatches
 * between related items. A failed batch is skipped, not fatal.
 */
export const COMMENT_BATCH_SIZE = 120;

export function buildCommentPrompt(input: {
  languageFrom: string;
  languageTo: string;
  items: CommentSourceItem[];
}): string {
  const rules = COMMENT_GENERATION_RULES.replaceAll(
    "{{languageFrom}}",
    input.languageFrom,
  ).replaceAll("{{languageTo}}", input.languageTo);

  return `
Add optional beginner study notes for these ${input.languageFrom} -> ${input.languageTo} word pairs.

Rules:
${rules}

Return JSON with this exact shape. Omit "comment" entirely for items that need no note:
{
  "items": [
    {
      "sourceIndex": 0,
      "comment": {
        "text": "short note in ${input.languageFrom}",
        "mentions": [
          { "word": "the word", "language": "from", "frequency": 3 }
        ]
      }
    }
  ]
}

Word pairs:
${JSON.stringify(input.items.map((item) => ({ sourceIndex: item.sourceIndex, known: item.known, target: item.target })))}
`.trim();
}

function extractItemsArray(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) ? items : [];
}

/**
 * Parse one batch response into GeneratedComment[]. Tolerant: malformed rows
 * are skipped, never thrown. Only well-formed comments (validated via the
 * shared normalizer) survive. `expected` constrains sourceIndex to the batch.
 */
export function parseCommentItems(
  value: unknown,
  expected: Set<number>,
): GeneratedComment[] {
  const result: GeneratedComment[] = [];
  const seen = new Set<number>();
  for (const row of extractItemsArray(value)) {
    if (!row || typeof row !== "object") continue;
    const rawIndex = (row as { sourceIndex?: unknown }).sourceIndex;
    if (typeof rawIndex !== "number" || !Number.isInteger(rawIndex)) continue;
    if (!expected.has(rawIndex) || seen.has(rawIndex)) continue;

    const rawComment = (row as { comment?: unknown }).comment;
    if (!rawComment || typeof rawComment !== "object") {
      // Item explicitly has no note. Mark as seen so we don't double-process.
      seen.add(rawIndex);
      continue;
    }
    // Normalize as a generated comment (drops over-long / malformed output).
    const normalized = normalizeWordItemComment({
      version: 1,
      source: "generated",
      text: (rawComment as { text?: unknown }).text,
      mentions: (rawComment as { mentions?: unknown }).mentions,
    });
    seen.add(rawIndex);
    if (!normalized) continue;
    result.push({
      sourceIndex: rawIndex,
      text: normalized.text,
      mentions: normalized.mentions,
    });
  }
  return result;
}

export type GenerateCommentsDeps = {
  /** Performs one chat call; returns raw model content. */
  call: (prompt: string) => Promise<string>;
};

/**
 * Generate comments for the given items in batches. Returns generated comments
 * keyed by sourceIndex. Best-effort per batch: a failed batch is logged and
 * skipped, never aborting the whole run.
 */
export async function generateComments(
  input: {
    languageFrom: string;
    languageTo: string;
    items: CommentSourceItem[];
  },
  deps: GenerateCommentsDeps,
): Promise<GeneratedComment[]> {
  const out: GeneratedComment[] = [];
  for (let i = 0; i < input.items.length; i += COMMENT_BATCH_SIZE) {
    const chunk = input.items.slice(i, i + COMMENT_BATCH_SIZE);
    const expected = new Set(chunk.map((item) => item.sourceIndex));
    const prompt = buildCommentPrompt({
      languageFrom: input.languageFrom,
      languageTo: input.languageTo,
      items: chunk,
    });
    try {
      const content = await deps.call(prompt);
      out.push(...parseCommentItems(parseJsonLoose(content), expected));
    } catch (err) {
      // Best-effort: comments are optional. Drop this batch and continue.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[comment-generation] batch failed; skipping", {
          batchStart: i,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  }
  return out;
}

/** Convenience: build a server-key OpenRouter caller for comment generation. */
export function makeServerCommentCaller(options: {
  apiKey: string;
  model: string;
  apiUrl?: string;
}): GenerateCommentsDeps {
  return {
    call: (prompt: string) =>
      callOpenRouterChatParsed(
        {
          apiKey: options.apiKey,
          model: options.model,
          apiUrl: options.apiUrl,
          responseFormat: { type: "json_object" as const },
          // Sized for the larger COMMENT_BATCH_SIZE. Comments are sparse, but a
          // batch where many rows do warrant a note must not truncate mid-array.
          maxTokens: 8_000,
          temperature: 0.2,
          messages: [
            { role: "system", content: COMMENT_SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
        },
        (content) => {
          if (!content) {
            throw new OpenRouterChatError("Empty comment response.", true);
          }
          return content;
        },
      ),
  };
}

/** Helper to wrap a generated comment for storage (source:"generated"). */
export function toGeneratedComment(generated: GeneratedComment): WordItemComment | null {
  return normalizeWordItemComment({
    version: 1,
    source: "generated",
    text: generated.text,
    mentions: generated.mentions,
  });
}
