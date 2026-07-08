import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { serializeWordList } from "@/lib/word-list-dto";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { autogenerateCommonWordListForUser } from "@/features/learning/onboarding/server/autogenerate-common-list";
import { OpenRouterChatError } from "@/lib/openrouter-chat";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const rawLanguageFrom = body.language_from;
  const rawLanguageTo = body.language_to;
  if (typeof rawLanguageFrom !== "string" || typeof rawLanguageTo !== "string") {
    return NextResponse.json(
      { error: "language_from and language_to are required" },
      { status: 400 },
    );
  }

  const languageFrom = normalizeLanguageCode(rawLanguageFrom);
  const languageTo = normalizeLanguageCode(rawLanguageTo);
  if (!languageFrom || !languageTo || languageFrom === languageTo) {
    return NextResponse.json(
      { error: "language_from and language_to must be different" },
      { status: 400 },
    );
  }

  try {
    const result = await autogenerateCommonWordListForUser({
      userId: user.id,
      languageFrom,
      languageTo,
    });
    return NextResponse.json({
      list: serializeWordList(result.list),
      item_count: result.itemCount,
      provider: result.provider,
      seed_kind: result.seedKind,
      seed_list_id: result.seedListId,
      reused_existing: result.reusedExisting,
      translation_stats: result.translationStats,
    });
  } catch (err) {
    // The donated server key is out of credits: this is our problem, not the
    // user's. Log loudly so we notice, and return a clear "try later" status.
    if (err instanceof OpenRouterChatError && err.isOutOfCredits) {
      console.error("[Get Word] OpenRouter server key is out of credits", { error: err.message });
      return NextResponse.json(
        { error: "List generation is temporarily unavailable. Please try again later.", code: "OPENROUTER_OUT_OF_CREDITS" },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "Could not autogenerate common list";
    const status =
      message.includes("limit reached") || message.includes("try again tomorrow")
        ? 429
        : message.includes("editor account")
          ? 503
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
