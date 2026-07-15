export const SERVER_AUTOGENERATE_MODEL = "anthropic/claude-opus-4.8";

// Human-readable model name for list descriptions; keep in sync with the slug above.
export const SERVER_AUTOGENERATE_MODEL_LABEL = "Claude Opus 4.8";

// A different strong model used to repair rows the primary model got wrong
// (e.g. wrong-script output). Using a different vendor avoids reproducing the
// same model's mistake on retry. Best-effort: repair failures keep the original.
export const SERVER_AUTOGENERATE_REPAIR_MODEL =
  process.env.OPENROUTER_REPAIR_MODEL ?? "google/gemini-2.5-pro";

// Retry the LLM on transient failures instead of falling back to context-free
// machine translation. Small list volume makes a few extra attempts cheap.
export const OPENROUTER_MAX_ATTEMPTS = 3;
export const OPENROUTER_RETRY_BASE_DELAY_MS = 600;

export const OPENROUTER_API_URL = process.env.OPENROUTER_API_BASE_URL?.replace(/\/+$/, "")
  ? `${process.env.OPENROUTER_API_BASE_URL.replace(/\/+$/, "")}/chat/completions`
  : "https://openrouter.ai/api/v1/chat/completions";

export const MAX_GENERATED_ITEMS = 400;
export const DEFAULT_LLM_ITEM_COUNT = 120;
// Larger batches let the model see related items together, which is what makes
// teaching-anchor consistency possible (reusing the same target wording for the
// same beginner meaning across the list). OpenRouter has no Google-style rate
// limit; the real ceiling is output-token truncation, so this is paired with a
// batch-derived maxTokens in openrouter.ts. Autogeneration currently emits only
// the primary pair/category (accepted variants are a separate BYOK workflow),
// so 100 rows remain comfortably bounded while reducing request count.
export const OPENROUTER_BATCH_SIZE = 100;
export const MAX_PROMPT_CHARS = 60_000;
