export const OPENROUTER_MODELS_URL = "https://openrouter.ai/models";

export const DEFAULT_OPENROUTER_TRANSLATION_MODEL =
  "google/gemini-2.5-flash-lite";

export const OPENROUTER_MODEL_STORAGE_KEY = "wordlink-list-openrouter-model";

export const OPENROUTER_TRANSLATION_MODELS = [
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    price: "$0.10/M input, $0.40/M output",
    note: "Fast, very low-cost default",
  },
  {
    id: "qwen/qwen3-235b-a22b-2507",
    name: "Qwen3 235B A22B Instruct",
    price: "$0.071/M input, $0.10/M output",
    note: "Strong multilingual value",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    name: "Mistral Small 3.2 24B",
    price: "$0.06/M input, $0.18/M output",
    note: "Good structured output at low cost",
  },
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    price: "$0.40/M input, $1.60/M output",
    note: "Balanced quality and speed",
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    price: "$0.30/M input, $2.50/M output",
    note: "Higher quality when nuance matters",
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    price: "$3/M input, $15/M output",
    note: "Premium fallback for difficult text",
  },
] as const;

export function normalizeOpenRouterModel(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_OPENROUTER_TRANSLATION_MODEL;
  const model = input.trim();
  if (!model || model.length > 200) return DEFAULT_OPENROUTER_TRANSLATION_MODEL;
  return model;
}
