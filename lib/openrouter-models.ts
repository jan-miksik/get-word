export const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

export const DEFAULT_OPENROUTER_TRANSLATION_MODEL = "anthropic/claude-opus-4.8";

export const OPENROUTER_MODEL_STORAGE_KEY = "get-word-list-openrouter-model";

export const OPENROUTER_TRANSLATION_MODELS = [
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    price: "$5/M input, $25/M output",
    note: "Best quality default",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    price: "$5/M input, $30/M output",
    note: "Premium comparison / alternative style",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    price: "$3/M input, $15/M output",
    note: "Premium but cheaper than Opus",
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    price: "$1.50/M input, $9/M output",
    note: "Google fallback, fast and strong",
  },
  {
    id: "qwen/qwen3.7-max",
    name: "Qwen3.7 Max",
    price: "$1.25/M input, $3.75/M output",
    note: "Strong multilingual / non-US option",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    price: "$0.435/M input, $0.87/M output",
    note: "Quality-first DeepSeek option",
  },
  {
    id: "minimax/minimax-m3",
    name: "MiniMax M3",
    price: "$0.30/M input, $1.20/M output",
    note: "Experimental new strong model",
  },
] as const;

export function normalizeOpenRouterModel(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_OPENROUTER_TRANSLATION_MODEL;
  const model = input.trim();
  if (!model || model.length > 200) return DEFAULT_OPENROUTER_TRANSLATION_MODEL;
  return model;
}
