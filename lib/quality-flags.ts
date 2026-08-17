/**
 * Heuristic flags stored on `content_quality_reviews.heuristic_flags`.
 *
 * Three sources feed this, and none of them is re-implemented here:
 *   - `lib/translation-validate.ts` — the five translation validators that
 *     already run on the live translation paths but were never persisted.
 *   - `lib/formatting-polish.ts` — deterministic capitalization/spacing checks.
 *   - the corpus-wide scan itself, which can see things no single-pair check
 *     can (the same source mapping to several targets).
 *
 * The weight is what separates "look at this" from "this is probably wrong".
 * Only `medium` and `high` move a row up the suspicion sort; `notice` is
 * informational and must never imply a defect.
 */

export const QUALITY_FLAG_CODES = [
  // lib/translation-validate.ts
  "looks_untranslated",
  "missing_target_capitalization",
  "missing_article_for_noun",
  "parenthetical_in_translation",
  "register_marker_mismatch",
  // lib/formatting-polish.ts
  "formatting_fix_available",
  "maybe_question",
  "maybe_exclamation",
  // corpus-wide, only visible from the pool
  "divergent_targets",
  "dominated_minority",
  "category_name_leak",
  // lib/audio-quality.ts, evaluated per side
  "audio_suspicious_size",
] as const;

export type QualityFlagCode = (typeof QUALITY_FLAG_CODES)[number];

/**
 * `notice` = worth a look, not evidence of a mistake. `medium`/`high` raise the
 * suspicion score. See `FLAG_WEIGHTS` for why each code sits where it does.
 */
export type QualityFlagWeight = "notice" | "medium" | "high";

export type QualityHeuristicFlag = {
  code: QualityFlagCode;
  weight: QualityFlagWeight;
  /** Which side of the pair the flag is about, when that is meaningful. */
  side?: "known" | "target";
  /** Human-readable detail, already produced by the underlying validator. */
  message?: string;
  /** Structured evidence, so an editor can see what the flag measured. */
  meta?: Record<string, string | number>;
};

const FLAG_WEIGHTS: Record<QualityFlagCode, QualityFlagWeight> = {
  // Wrong script for the target language is close to conclusive.
  looks_untranslated: "high",
  // A minority reading inside an otherwise dominant group — 1 in 98 is a very
  // different claim from a 50/50 split, which is why it is its own code.
  dominated_minority: "high",
  // The learner's category name leaked into the word itself.
  category_name_leak: "high",
  missing_article_for_noun: "medium",
  register_marker_mismatch: "medium",
  parenthetical_in_translation: "medium",
  missing_target_capitalization: "medium",
  audio_suspicious_size: "medium",
  formatting_fix_available: "notice",
  maybe_question: "notice",
  maybe_exclamation: "notice",
  // `bank` → "banka" and `bank` → "břeh" are both correct. Legitimate synonyms
  // and polysemy make divergence normal, so this is a prompt to check, never a
  // claim of error. `dominated_minority` is the version that accuses.
  divergent_targets: "notice",
};

export function weightForFlag(code: QualityFlagCode): QualityFlagWeight {
  return FLAG_WEIGHTS[code];
}

const WEIGHT_POINTS: Record<QualityFlagWeight, number> = {
  notice: 0,
  medium: 2,
  high: 5,
};

/**
 * Sort key for "probably a bad translation". Notices contribute nothing, so a
 * row flagged only as `divergent_targets` stays at the bottom where it belongs.
 */
export function suspicionScore(flags: QualityHeuristicFlag[]): number {
  return flags.reduce((total, flag) => total + WEIGHT_POINTS[flag.weight], 0);
}

export function isQualityFlagCode(value: unknown): value is QualityFlagCode {
  return (
    typeof value === "string" &&
    (QUALITY_FLAG_CODES as readonly string[]).includes(value)
  );
}
