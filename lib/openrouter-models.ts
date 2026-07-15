export const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

export const DEFAULT_OPENROUTER_TRANSLATION_MODEL = "anthropic/claude-sonnet-5";

export const OPENROUTER_MODEL_STORAGE_KEY = "get-word-list-openrouter-model";

export const OPENROUTER_TRANSLATION_MODELS = [
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    price: "$2/M input, $10/M output",
    note: "Recommended: strongest quality/cost balance",
  },
  {
    id: "openai/gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    price: "$0.75/M input, $4.50/M output",
    note: "Efficient structured-output alternative",
  },
  {
    id: "openai/gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    price: "$0.20/M input, $1.25/M output",
    note: "Fast high-volume extraction",
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    price: "$5/M input, $25/M output",
    note: "Premium fallback for difficult lists",
  },
  {
    id: "openai/gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    price: "$1/M input, $6/M output",
    note: "Current fast OpenAI model",
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
    id: "deepseek/deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    price: "$0.10/M input, $0.20/M output",
    note: "Budget option; reasoning disabled for sparse suggestions",
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
