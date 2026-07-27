import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { runChatTurn, sanitizeMessages } from "@/features/word-chat/server/chat";
import { loadLearnerBrief } from "@/features/word-chat/server/personal-list";
import { reserveChatTurn } from "@/features/word-chat/server/rate-limit";
import { serializeDiagnostics } from "@/features/word-chat/server/diagnostics";
import {
  WORD_CHAT_CHAT_MODEL,
  canSeeWordChatDiagnostics,
  resolveSelectedModel,
} from "@/features/word-chat/server/config";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const languageFrom = normalizeLanguageCode(body.language_from);
  const languageTo = normalizeLanguageCode(body.language_to);
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";

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
  // Model choice and prompt echo are a workbench, not a user feature: the
  // donated key must not be routable to an arbitrary model by anyone who can
  // post here.
  const canDebug = canSeeWordChatDiagnostics(role);

  try {
    // Reserve before the model call: an over-limit turn must cost nothing.
    await reserveChatTurn({ userId: user.id, sessionId, role });

    const brief = await loadLearnerBrief({ userId: user.id, languageFrom, languageTo });
    const result = await runChatTurn({
      userId: user.id,
      sessionId,
      languageFrom,
      languageTo,
      // The chat is written in the language the learner already knows.
      chatLanguage: normalizeLanguageCode(body.chat_language) || languageFrom,
      brief,
      messages,
      model: canDebug ? resolveSelectedModel(body.model, WORD_CHAT_CHAT_MODEL) : undefined,
      includeRequest: canDebug,
    });

    return NextResponse.json({
      reply: result.reply,
      suggestions: result.suggestions,
      ready_to_propose: result.readyToPropose,
      diagnostics: canDebug ? serializeDiagnostics(result.diagnostics) : null,
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
