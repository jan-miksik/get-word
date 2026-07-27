import { db } from "@/lib/db/client";
import { wordChatUsage } from "@/lib/db/schema";
import type { OpenRouterChatMeta } from "@/lib/openrouter-chat";
import { estimateCostUsd } from "./config";
import { readTokenCount } from "./diagnostics";

export type WordChatCallType = "chat" | "proposal" | "translation" | "brief";
export type WordChatStage =
  | "started"
  | "proposal_completed"
  | "review_completed"
  | "committed";

/**
 * Record one model call's spend.
 *
 * Deliberately best-effort: a failed insert must never turn a working chat into
 * an error the learner sees. A missing usage row costs a data point; a thrown
 * one costs the session.
 *
 * Stores token counts and a price estimate only — never prompt or completion
 * text. `stage` is the funnel position at the time of the call, which is what
 * makes "cost of sessions people abandon" answerable.
 */
export async function recordWordChatUsage(input: {
  userId: string;
  sessionId: string;
  callType: WordChatCallType;
  stage: WordChatStage;
  model: string;
  meta?: OpenRouterChatMeta;
  itemCount?: number;
}): Promise<void> {
  try {
    const inputTokens = readTokenCount(input.meta?.usage, "prompt_tokens");
    const outputTokens = readTokenCount(input.meta?.usage, "completion_tokens");
    await db.insert(wordChatUsage).values({
      userId: input.userId,
      sessionId: input.sessionId,
      callType: input.callType,
      stage: input.stage,
      model: input.model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(input.model, inputTokens, outputTokens).toFixed(6),
      itemCount: input.itemCount ?? null,
    });
  } catch (err) {
    console.warn("[word-chat] failed to record usage", {
      callType: input.callType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
