import { NextResponse } from "next/server";
import { OpenRouterChatError } from "@/lib/openrouter-chat";
import { DailyLimitError } from "@/lib/rate-limit/daily-bucket";
import { WordChatUnavailableError } from "@/features/word-chat/server/chat";
import { WordChatCommitError } from "@/features/word-chat/server/commit";

/**
 * Shared error mapping for every word-chat route.
 *
 * The distinction that matters to the learner is *terminal vs transient*, not
 * which layer failed:
 *
 * - `WORD_CHAT_UNAVAILABLE` — no key, a rejected key, or an empty account. The
 *   next attempt fails identically, so the client offers the ready-made list.
 * - `WORD_CHAT_TEMPORARY` — a provider hiccup, a timeout, a truncated or
 *   unparseable answer. The conversation is still good; the client offers Retry.
 *
 * Collapsing the second case into the first is what turns a five-second outage
 * into an abandoned onboarding, so anything not provably terminal is transient.
 */

/** Key rejected (401/403) or account empty (402): trying again changes nothing. */
function isTerminalOpenRouterFailure(err: OpenRouterChatError): boolean {
  return err.status === 401 || err.status === 402 || err.status === 403;
}

export function wordChatErrorResponse(
  err: unknown,
  options: {
    /**
     * Attach the real cause to the response. Editors and non-production builds
     * only — otherwise a provider's error text reaches every learner's console.
     * Without it the only trace of a failure is a server log nobody reads until
     * someone reports the generic sentence, which is how this was invisible.
     */
    includeDetail?: boolean;
  } = {},
): NextResponse {
  if (err instanceof DailyLimitError) {
    return NextResponse.json(
      { error: err.message, code: err.code, retryable: false },
      { status: 429 },
    );
  }

  if (err instanceof WordChatCommitError) {
    return NextResponse.json(
      { error: err.message, code: err.code, retryable: false },
      { status: 400 },
    );
  }

  if (err instanceof WordChatUnavailableError) {
    return NextResponse.json(
      { error: err.message, code: err.code, retryable: false },
      { status: 503 },
    );
  }

  if (err instanceof OpenRouterChatError) {
    const terminal = isTerminalOpenRouterFailure(err);
    // The learner gets one generic sentence, so the real cause has to be logged
    // or it is invisible: a truncated response, a routing failure, and an
    // exhausted key all look identical from the outside.
    console.error("[word-chat] OpenRouter call failed", {
      message: err.message,
      status: err.status,
      kind: err.kind,
      retryable: err.retryable,
      outOfCredits: err.isOutOfCredits,
      terminal,
    });
    return NextResponse.json(
      {
        error: terminal
          ? "The word chat is unavailable right now."
          : "The word chat could not answer just now. Please try again.",
        code: terminal ? "WORD_CHAT_UNAVAILABLE" : "WORD_CHAT_TEMPORARY",
        retryable: !terminal,
        ...(options.includeDetail
          ? { detail: `${err.kind}${err.status ? ` ${err.status}` : ""}: ${err.message}` }
          : {}),
      },
      { status: 503 },
    );
  }

  console.error("[word-chat] unexpected failure", {
    error: err instanceof Error ? err.message : String(err),
  });
  return NextResponse.json(
    {
      error: "Something went wrong. Please try again.",
      code: "WORD_CHAT_FAILED",
      retryable: true,
      ...(options.includeDetail && err instanceof Error ? { detail: err.message } : {}),
    },
    { status: 500 },
  );
}
