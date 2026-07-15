import {
  isSlotCompatibleAlternative,
  normalizeAnswerCloseKey,
  normalizeAnswerExactKey,
} from "@/lib/answer-normalization";

export const MAX_ACCEPTED_ANSWERS = 10;
export const MAX_ACCEPTED_ANSWER_LENGTH = 120;
// Quality-first: sparse, high-confidence suggestions are more useful than a
// long list that users have to distrust and manually clean up.
export const MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS = 5;
// Bulk suggestion batches: one LLM call per request; the client chunks longer
// lists so each request stays within a comfortable token/latency budget.
export const BULK_ACCEPTED_ANSWERS_CHUNK_SIZE = 100;
// Bounded client concurrency shortens large-list scans without opening enough
// simultaneous OpenRouter requests to invite rate limiting.
export const BULK_ACCEPTED_ANSWERS_CONCURRENCY = 3;

export class AcceptedAnswersValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptedAnswersValidationError";
  }
}

function cleanAcceptedAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFC").trim();
  return cleaned ? cleaned : null;
}

function normalizeAcceptedAnswersBase(
  value: unknown,
  primary: string | null | undefined,
  options: { strict: boolean; limit: number },
): string[] {
  if (!Array.isArray(value)) {
    if (options.strict && value !== undefined) {
      throw new AcceptedAnswersValidationError("Accepted answers must be an array.");
    }
    return [];
  }
  if (options.strict && value.length > MAX_ACCEPTED_ANSWERS) {
    throw new AcceptedAnswersValidationError(
      `Accepted answers are limited to ${MAX_ACCEPTED_ANSWERS} variants per side.`,
    );
  }

  const primaryKey = normalizeAnswerExactKey(primary ?? "");
  const seen = new Set<string>();
  const answers: string[] = [];
  for (const item of value) {
    const cleaned = cleanAcceptedAnswer(item);
    if (!cleaned) continue;
    if (cleaned.length > MAX_ACCEPTED_ANSWER_LENGTH) {
      if (options.strict) {
        throw new AcceptedAnswersValidationError(
          `Accepted answer variants are limited to ${MAX_ACCEPTED_ANSWER_LENGTH} characters.`,
        );
      }
      continue;
    }
    const key = normalizeAnswerExactKey(cleaned);
    if (!key || key === primaryKey || seen.has(key)) continue;
    seen.add(key);
    answers.push(cleaned);
    if (answers.length >= options.limit) break;
  }
  return answers;
}

export function normalizeAcceptedAnswersForSave(
  value: unknown,
  primary: string | null | undefined,
): string[] {
  const normalized = normalizeAcceptedAnswersBase(value, primary, {
    strict: true,
    limit: MAX_ACCEPTED_ANSWERS,
  });
  if (normalized.length > MAX_ACCEPTED_ANSWERS) {
    throw new AcceptedAnswersValidationError(
      `Accepted answers are limited to ${MAX_ACCEPTED_ANSWERS} variants per side.`,
    );
  }
  return normalized;
}

export function normalizeAcceptedAnswersForDisplay(
  value: unknown,
  primary?: string | null,
): string[] {
  return normalizeAcceptedAnswersBase(value, primary, {
    strict: false,
    limit: MAX_ACCEPTED_ANSWERS,
  });
}

export function normalizeAcceptedAnswersForAiSuggestions(
  value: unknown,
  primary: string | null | undefined,
  existing: unknown = [],
): string[] {
  const existingKeys = new Set(
    normalizeAcceptedAnswersForDisplay(existing, primary).map((answer) =>
      normalizeAnswerExactKey(answer),
    ),
  );
  const primaryCloseKey = normalizeAnswerCloseKey(primary ?? "");
  return normalizeAcceptedAnswersBase(value, primary, {
    strict: false,
    // Validate/filter first, then apply the small AI cap below. Otherwise an
    // invalid early candidate could consume a slot and hide a valid later one.
    limit: MAX_ACCEPTED_ANSWERS,
  })
    // AI suggestions must stay typeable through the primary answer's letter
    // mask (same grapheme count, matching punctuation slots); manual entries
    // via normalizeAcceptedAnswersForSave are intentionally unrestricted.
    .filter((answer) => isSlotCompatibleAlternative(primary ?? "", answer))
    // Accent/case-only differences already receive the app's `close` verdict.
    // Storing them as separate translations (e.g. den/děn or Nevím/Nevim)
    // adds no accepted behavior and rewards model-generated misspellings.
    .filter((answer) => normalizeAnswerCloseKey(answer) !== primaryCloseKey)
    .filter((answer) => !existingKeys.has(normalizeAnswerExactKey(answer)))
    .slice(0, MAX_AI_ACCEPTED_ANSWER_SUGGESTIONS);
}
