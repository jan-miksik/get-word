import type { OpenRouterChatMeta } from "@/lib/openrouter-chat";
import { estimateCostUsd } from "./config";

/**
 * What one model call cost and what it was made of.
 *
 * `word_chat_usage` is the durable record, but it answers questions days later
 * and never stores prompt text. This is the live view: it rides back on the
 * response so the editor-only debug panel can show, while the session is
 * happening, which model ran, what it cost, and exactly what was sent.
 *
 * `request` is editor-only. It contains the learner's own conversation and
 * their existing items (as the exclusion list), so it must never travel to
 * anyone else.
 */
export type WordChatCallType = "chat" | "proposal" | "translation";

export type WordChatCallDiagnostics = {
  callType: WordChatCallType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  request?: {
    maxTokens: number;
    provider: unknown;
    messages: { role: string; content: string }[];
  };
};

export function readTokenCount(
  usage: Record<string, unknown> | undefined,
  key: "prompt_tokens" | "completion_tokens",
): number {
  const value = Number(usage?.[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function buildCallDiagnostics(input: {
  callType: WordChatCallType;
  model: string;
  meta?: OpenRouterChatMeta;
  startedAt: number;
  /** Pass only when the caller is an editor. */
  request?: WordChatCallDiagnostics["request"];
}): WordChatCallDiagnostics {
  const inputTokens = readTokenCount(input.meta?.usage, "prompt_tokens");
  const outputTokens = readTokenCount(input.meta?.usage, "completion_tokens");
  return {
    callType: input.callType,
    model: input.model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: estimateCostUsd(input.model, inputTokens, outputTokens),
    durationMs: Date.now() - input.startedAt,
    ...(input.request ? { request: input.request } : {}),
  };
}

/** Wire shape: snake_case like every other word-chat response field. */
export function serializeDiagnostics(diagnostics: WordChatCallDiagnostics) {
  return {
    call_type: diagnostics.callType,
    model: diagnostics.model,
    input_tokens: diagnostics.inputTokens,
    output_tokens: diagnostics.outputTokens,
    estimated_cost_usd: diagnostics.estimatedCostUsd,
    duration_ms: diagnostics.durationMs,
    request: diagnostics.request ?? null,
  };
}
