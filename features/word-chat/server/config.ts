import { parsePositiveIntEnv } from "@/lib/rate-limit/daily-bucket";

/**
 * Word-chat model routing and sizing.
 *
 * Three call sites share one donated key (`OPENROUTER_SERVER_API_KEY`) and, for
 * now, one model: Sonnet 5 everywhere. The proposal call is the one plausibly
 * worth more (usage-frequency judgement, content-word extraction, corpus reuse),
 * so it is the first candidate to move — but only once `word_chat_usage` and
 * real output say so, not on a hunch.
 *
 * Every id is env-overridable, so an A/B is a deploy setting rather than a code
 * change, and the debug panel switches any of them per session. Actual spend is
 * recorded per call — do not reason about cost from the estimates here.
 */

export const WORD_CHAT_CHAT_MODEL =
  process.env.WORD_CHAT_CHAT_MODEL ?? "anthropic/claude-sonnet-5";

export const WORD_CHAT_PROPOSAL_MODEL =
  process.env.WORD_CHAT_PROPOSAL_MODEL ?? "anthropic/claude-sonnet-5";

export const WORD_CHAT_TRANSLATION_MODEL =
  process.env.WORD_CHAT_TRANSLATION_MODEL ?? "anthropic/claude-sonnet-5";

/** The brief is a small structured rewrite; it does not need the proposal model. */
export const WORD_CHAT_BRIEF_MODEL =
  process.env.WORD_CHAT_BRIEF_MODEL ?? "anthropic/claude-sonnet-5";

export const OPENROUTER_API_URL = process.env.OPENROUTER_API_BASE_URL?.replace(/\/+$/, "")
  ? `${process.env.OPENROUTER_API_BASE_URL.replace(/\/+$/, "")}/chat/completions`
  : "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_MAX_ATTEMPTS = 3;
export const OPENROUTER_RETRY_BASE_DELAY_MS = 600;

/**
 * A single word-chat call is one model round-trip the learner is waiting on.
 * The shared client treats a timeout as retryable, so a too-short timeout turns
 * one slow call into three and a ~3-minute wait before a generic failure.
 */
export const OPENROUTER_TIMEOUT_MS = 90_000;

/**
 * Output budgets.
 *
 * These are NOT "how long the answer should be" — reasoning tokens come out of
 * the same budget, and a strong model spends them freely. A cap that is merely
 * tight produces `finish_reason: "length"`, which the shared client classifies
 * as retryable: every attempt is paid for in full, and the learner waits for all
 * of them before seeing a generic error. Set these well above the expected
 * answer size; the model stops when it is done, so headroom is free.
 */
export const CHAT_MAX_TOKENS = 2_000;
export const PROPOSAL_MAX_TOKENS = 8_000;
export const BRIEF_MAX_TOKENS = 2_000;

/**
 * Item sizing. ~3 sentences + ~7 supporting words: the supporting words are the
 * content words OF those sentences, so a bigger sentence count multiplies into
 * far more items than a learner can absorb in one sitting.
 */
export const TARGET_SENTENCE_COUNT = 3;
export const TARGET_WORD_COUNT = 7;
export const TARGET_ITEM_COUNT = TARGET_SENTENCE_COUNT + TARGET_WORD_COUNT;

/** Hard ceiling on one session. Not a ceiling on the personal list itself. */
export const MAX_ITEMS_PER_SESSION = parsePositiveIntEnv(
  process.env.WORD_CHAT_MAX_ITEMS_PER_SESSION,
  30,
);

/** Soft warning threshold — advisory only, never blocks the learner. */
export const SOFT_ITEM_WARNING_THRESHOLD = parsePositiveIntEnv(
  process.env.WORD_CHAT_SOFT_ITEM_WARNING_THRESHOLD,
  15,
);

/** Free monthly budget of newly committed items. */
export const MONTHLY_ITEM_LIMIT = parsePositiveIntEnv(
  process.env.WORD_CHAT_MONTHLY_ITEM_LIMIT,
  60,
);

export const EDITOR_MONTHLY_ITEM_LIMIT = parsePositiveIntEnv(
  process.env.WORD_CHAT_EDITOR_MONTHLY_ITEM_LIMIT,
  600,
);

export const MAX_MESSAGES_PER_SESSION = parsePositiveIntEnv(
  process.env.WORD_CHAT_MAX_MESSAGES_PER_SESSION,
  12,
);

export const SESSIONS_PER_DAY = parsePositiveIntEnv(
  process.env.WORD_CHAT_SESSIONS_PER_DAY,
  5,
);

export const EDITOR_SESSIONS_PER_DAY = parsePositiveIntEnv(
  process.env.WORD_CHAT_EDITOR_SESSIONS_PER_DAY,
  25,
);

/** Abuse ceiling across all users; the donated key is a shared resource. */
export const GLOBAL_CHAT_TURNS_PER_DAY = parsePositiveIntEnv(
  process.env.WORD_CHAT_GLOBAL_TURNS_PER_DAY,
  1_000,
);

/** Longest single learner message accepted, in characters. */
export const MAX_USER_MESSAGE_CHARS = 1_000;

/**
 * How many existing items are loaded as reuse candidates.
 *
 * None of these reach the model — the proposal prompt no longer carries a
 * corpus block — so this bounds a match table, not prompt size, and can be
 * generous. In-memory matching against a few thousand short strings is faster
 * than a round-trip; once one language pair outgrows that, the fix is an
 * indexed normalized-key column and a lookup on the ~14 proposed texts, not a
 * bigger number here.
 */
export const CORPUS_POOL_LIMIT = parsePositiveIntEnv(
  process.env.WORD_CHAT_CORPUS_POOL_LIMIT,
  5_000,
);

/** Hard cap on existing items loaded for server-side duplicate rejection. */
export const EXCLUSION_LIMIT = parsePositiveIntEnv(
  process.env.WORD_CHAT_EXCLUSION_LIMIT,
  10_000,
);

/**
 * How many existing items are shown to the model. The full exclusion set is
 * still enforced server-side after normalization, so this only affects prompt
 * size and model guidance.
 */
export const EXCLUSION_PROMPT_LIMIT = parsePositiveIntEnv(
  process.env.WORD_CHAT_EXCLUSION_PROMPT_LIMIT,
  120,
);

/**
 * Provider routing sent with every word-chat call.
 *
 * OpenRouter states it does not store prompt content by default, but individual
 * providers set their own retention. Learners type free text here — where they
 * work, who they live with — so zero-data-retention and no training collection
 * are requested at the request level, not merely promised in the privacy policy.
 */
export const WORD_CHAT_PROVIDER_PREFERENCES = {
  zdr: true,
  data_collection: "deny",
} as const;

/**
 * Per-million-token prices used only to fill `word_chat_usage.estimated_cost_usd`.
 * Prices move; this is a logging convenience, not a billing source of truth, and
 * an unknown model records 0 rather than guessing.
 */
const MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "deepseek/deepseek-v4-flash": { input: 0.09, output: 0.18 },
  "anthropic/claude-opus-5": { input: 5, output: 25 },
  "anthropic/claude-opus-4.8": { input: 5, output: 25 },
  "anthropic/claude-sonnet-5": { input: 2, output: 10 },
  "anthropic/claude-sonnet-4.6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4.5": { input: 1, output: 5 },
};

/**
 * Models an editor may switch a call to from the debug panel, with the prices
 * used for the running cost estimate. The price table IS the allowlist: a model
 * we cannot price is one whose spend we cannot report, and an unvalidated model
 * id from the client would let anyone route the donated key anywhere.
 */
export const SELECTABLE_MODELS = Object.entries(MODEL_PRICES_USD_PER_MILLION).map(
  ([id, price]) => ({
    id,
    inputPricePerMillion: price.input,
    outputPricePerMillion: price.output,
  }),
);

/**
 * Who may see the debug panel — the live model/cost/prompt view — and switch
 * models with it.
 *
 * Editors in any environment, plus everyone on a non-production build: the
 * panel exists to tune this flow, and a development database usually has no
 * editor account at all. The model list is allowlisted separately, so the worst
 * a dev-mode client can do is pick a model we already price.
 */
export function canSeeWordChatDiagnostics(role: "user" | "editor"): boolean {
  return role === "editor" || process.env.NODE_ENV !== "production";
}

/** A client-requested model, or the configured default when it is not allowed. */
export function resolveSelectedModel(requested: unknown, fallback: string): string {
  if (typeof requested !== "string") return fallback;
  const trimmed = requested.trim();
  return trimmed && trimmed in MODEL_PRICES_USD_PER_MILLION ? trimmed : fallback;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = MODEL_PRICES_USD_PER_MILLION[model];
  if (!price) return 0;
  const cost =
    (inputTokens * price.input) / 1_000_000 + (outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function getServerApiKey(): string | null {
  const key = process.env.OPENROUTER_SERVER_API_KEY?.trim();
  return key ? key : null;
}
