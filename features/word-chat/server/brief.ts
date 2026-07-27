import {
  callOpenRouterChatParsedWithMeta,
  parseJsonLoose,
} from "@/lib/openrouter-chat";
import {
  normalizeLearnerBrief,
  withCoveredTopic,
  type LearnerBrief,
} from "@/lib/learner-brief";
import {
  BRIEF_MAX_TOKENS,
  OPENROUTER_API_URL,
  OPENROUTER_RETRY_BASE_DELAY_MS,
  OPENROUTER_TIMEOUT_MS,
  WORD_CHAT_BRIEF_MODEL,
  WORD_CHAT_PROVIDER_PREFERENCES,
  getServerApiKey,
} from "./config";
import { buildBriefPrompt } from "./prompt";
import { recordWordChatUsage } from "./usage";
import type { WordChatMessage } from "../types";

/**
 * Produce the REPLACEMENT learner brief for the next session.
 *
 * Runs before the commit transaction opens — never hold a transaction across an
 * LLM round-trip — and is best-effort by design: if the model is slow, wrong, or
 * unavailable, the committed topic is still folded in locally so the brief never
 * silently goes stale. A failed brief must not fail a commit the learner already
 * confirmed.
 *
 * `normalizeLearnerBrief` drops anything outside the schema, which is what stops
 * the model from smuggling names or health details into storage as free text.
 */
export async function regenerateLearnerBrief(input: {
  userId: string;
  sessionId: string;
  previousBrief: LearnerBrief | null;
  messages: WordChatMessage[];
  committedTopic: string;
}): Promise<LearnerBrief> {
  const fallback = withCoveredTopic(input.previousBrief, input.committedTopic);

  const apiKey = getServerApiKey();
  if (!apiKey || input.messages.length === 0) return fallback;

  try {
    const { system, user } = buildBriefPrompt({
      previousBrief: input.previousBrief,
      messages: input.messages,
      committedTopic: input.committedTopic,
    });

    const { value, meta } = await callOpenRouterChatParsedWithMeta(
      {
        apiKey,
        model: WORD_CHAT_BRIEF_MODEL,
        apiUrl: OPENROUTER_API_URL,
        // One attempt: the local fallback is already correct enough, so retrying
        // only delays a commit the learner is waiting on.
        maxAttempts: 1,
        retryBaseDelayMs: OPENROUTER_RETRY_BASE_DELAY_MS,
        timeoutMs: OPENROUTER_TIMEOUT_MS,
        maxTokens: BRIEF_MAX_TOKENS,
        responseFormat: { type: "json_object" },
        provider: { ...WORD_CHAT_PROVIDER_PREFERENCES },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      (content) => normalizeLearnerBrief(parseJsonLoose(content)),
    );

    await recordWordChatUsage({
      userId: input.userId,
      sessionId: input.sessionId,
      callType: "brief",
      stage: "review_completed",
      model: WORD_CHAT_BRIEF_MODEL,
      meta,
    });

    // Even a good model reply must contain the topic just committed.
    return withCoveredTopic(value, input.committedTopic);
  } catch (err) {
    console.warn("[word-chat] brief regeneration failed; keeping local merge", {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}
