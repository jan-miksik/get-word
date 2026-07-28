import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { sanitizeMessages } from "@/features/word-chat/server/chat";
import { proposeItems } from "@/features/word-chat/server/propose";
import {
  loadLearnerBrief,
  needsVisibilityChoice,
} from "@/features/word-chat/server/personal-list";
import {
  getMonthlyItemUsage,
  reserveChatTurn,
} from "@/features/word-chat/server/rate-limit";
import {
  MAX_ITEMS_PER_SESSION,
  MAX_WORD_CHAT_ID_CHARS,
  SOFT_ITEM_WARNING_THRESHOLD,
  WORD_CHAT_PROPOSAL_MODEL,
  canSeeWordChatDiagnostics,
  resolveSelectedModel,
} from "@/features/word-chat/server/config";
import { serializeDiagnostics } from "@/features/word-chat/server/diagnostics";
import { readLanguageLevel } from "@/features/word-chat/preferences";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const languageFrom = normalizeLanguageCode(body.language_from);
  const languageTo = normalizeLanguageCode(body.language_to);
  const sessionId =
    typeof body.session_id === "string"
      ? body.session_id.trim().slice(0, MAX_WORD_CHAT_ID_CHARS)
      : "";

  if (!languageFrom || !languageTo || languageFrom === languageTo) {
    return NextResponse.json(
      { error: "language_from and language_to must be different" },
      { status: 400 },
    );
  }
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const messages = sanitizeMessages(body.messages);
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  const role = user.userRole === "editor" ? "editor" : "user";
  const canDebug = canSeeWordChatDiagnostics(role);

  try {
    // A proposal is a model call like any other; it comes out of the same turn
    // allowance so "press suggest repeatedly" is not an unmetered loop.
    await reserveChatTurn({ userId: user.id, sessionId, role });

    const briefPromise = loadLearnerBrief({ userId: user.id, languageFrom, languageTo });
    const askVisibilityPromise = needsVisibilityChoice({
      userId: user.id,
      languageFrom,
      languageTo,
    });
    const usagePromise = getMonthlyItemUsage({ userId: user.id, role });

    // Only the brief is an input to the model. Visibility and quota metadata
    // can finish alongside the slow provider call instead of delaying its
    // start.
    const proposalPromise = briefPromise.then((brief) =>
      proposeItems({
        userId: user.id,
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage: normalizeLanguageCode(body.chat_language) || languageFrom,
        languageLevel: readLanguageLevel(body.language_level) ?? "A0",
        brief,
        messages,
        baseListId:
          typeof body.base_list_id === "string" && UUID_RE.test(body.base_list_id)
            ? body.base_list_id
            : undefined,
        model: canDebug ? resolveSelectedModel(body.model, WORD_CHAT_PROPOSAL_MODEL) : undefined,
        includeRequest: canDebug,
      }),
    );

    const [proposal, askVisibility, usage] = await Promise.all([
      proposalPromise,
      askVisibilityPromise,
      usagePromise,
    ]);

    return NextResponse.json({
      diagnostics: canDebug ? serializeDiagnostics(proposal.diagnostics) : null,
      category_name: proposal.categoryName,
      review_label: proposal.reviewLabel,
      items: proposal.items,
      ask_visibility: askVisibility,
      limits: {
        max_items_per_session: MAX_ITEMS_PER_SESSION,
        soft_item_warning_threshold: SOFT_ITEM_WARNING_THRESHOLD,
        monthly_used: usage.used,
        monthly_limit: usage.limit,
        monthly_reset_at: usage.resetAt.toISOString(),
      },
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
