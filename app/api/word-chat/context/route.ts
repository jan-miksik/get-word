import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { loadLearnerBrief } from "@/features/word-chat/server/personal-list";
import { getMonthlyItemUsage } from "@/features/word-chat/server/rate-limit";
import {
  SELECTABLE_MODELS,
  canSeeWordChatDiagnostics,
  WORD_CHAT_CHAT_MODEL,
  WORD_CHAT_PROPOSAL_MODEL,
  WORD_CHAT_TRANSLATION_MODEL,
} from "@/features/word-chat/server/config";
import { isLearnerBriefEmpty } from "@/lib/learner-brief";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

/**
 * GET /api/word-chat/context — what the chat should already know before the
 * learner types anything.
 *
 * Opening "Add words" from inside the app is not onboarding: someone on their
 * fourth session should not be greeted with the same "tell me about a real
 * situation" as a first-time visitor. This returns the structured brief (topic
 * labels only, never a transcript) so the opener can pick up where the last
 * session left off, plus the monthly allowance so the screen can say up front
 * when there is nothing left to spend.
 *
 * No model call — deterministic and cheap enough to run on every open.
 */
export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const languageFrom = normalizeLanguageCode(request.nextUrl.searchParams.get("from"));
  const languageTo = normalizeLanguageCode(request.nextUrl.searchParams.get("to"));
  if (!languageFrom || !languageTo || languageFrom === languageTo) {
    return NextResponse.json(
      { error: "from and to must be different languages" },
      { status: 400 },
    );
  }

  const isEditor = user.userRole === "editor";
  const canDebug = canSeeWordChatDiagnostics(isEditor ? "editor" : "user");

  try {
    const [brief, usage] = await Promise.all([
      loadLearnerBrief({ userId: user.id, languageFrom, languageTo }),
      getMonthlyItemUsage({ userId: user.id, role: isEditor ? "editor" : "user" }),
    ]);

    const hasHistory = !isLearnerBriefEmpty(brief);

    return NextResponse.json({
      has_history: hasHistory,
      goals: brief?.goals ?? [],
      covered_topics: brief?.coveredTopics ?? [],
      missing_topics: brief?.missingTopics ?? [],
      monthly_used: usage.used,
      monthly_limit: usage.limit,
      // Everything below drives the debug panel.
      is_editor: canDebug,
      models: canDebug
        ? {
            defaults: {
              chat: WORD_CHAT_CHAT_MODEL,
              proposal: WORD_CHAT_PROPOSAL_MODEL,
              translation: WORD_CHAT_TRANSLATION_MODEL,
            },
            selectable: SELECTABLE_MODELS.map((model) => ({
              id: model.id,
              input_price_per_million: model.inputPricePerMillion,
              output_price_per_million: model.outputPricePerMillion,
            })),
          }
        : null,
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
