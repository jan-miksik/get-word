import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import {
  runChatTurn,
  sanitizeAddressRegister,
  sanitizeLanguageLevel,
  sanitizeMessages,
  sanitizeSalutationGender,
  streamChatTurn,
} from "@/features/word-chat/server/chat";
import { loadLearnerBrief } from "@/features/word-chat/server/personal-list";
import { reserveChatTurn } from "@/features/word-chat/server/rate-limit";
import { serializeDiagnostics } from "@/features/word-chat/server/diagnostics";
import { assertWordChatSpendAvailable } from "@/features/word-chat/server/usage";
import {
  WORD_CHAT_CHAT_MODEL,
  MAX_WORD_CHAT_ID_CHARS,
  canSeeWordChatDiagnostics,
  resolveSelectedModel,
} from "@/features/word-chat/server/config";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  // Model choice and prompt echo are a workbench, not a user feature: the
  // donated key must not be routable to an arbitrary model by anyone who can
  // post here.
  const canDebug = canSeeWordChatDiagnostics(role);

  try {
    // Check spend before reserving a turn: a monthly-limit rejection must not
    // consume any of the daily/session allowance either.
    await assertWordChatSpendAvailable(user.id);
    await reserveChatTurn({ userId: user.id, sessionId, role });

    const brief = await loadLearnerBrief({ userId: user.id, languageFrom, languageTo });
    if (body.stream === true) {
      const streamAbort = new AbortController();
      const stream = await streamChatTurn({
        userId: user.id,
        sessionId,
        languageFrom,
        languageTo,
        chatLanguage: normalizeLanguageCode(body.chat_language) || languageFrom,
        addressRegister: sanitizeAddressRegister(body.address_register),
        salutationGender: sanitizeSalutationGender(body.salutation_gender),
        languageLevel: sanitizeLanguageLevel(body.language_level),
        brief,
        messages,
        model: canDebug ? resolveSelectedModel(body.model, WORD_CHAT_CHAT_MODEL) : undefined,
        includeRequest: canDebug,
        signal: AbortSignal.any([request.signal, streamAbort.signal]),
      });
      const encoder = new TextEncoder();
      let done = false;
      return new Response(
        new ReadableStream<Uint8Array>({
          cancel() { done = true; streamAbort.abort(); },
          async start(controller) {
            const send = (event: unknown) => {
              if (done) return;
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            };
            try {
              for await (const event of stream) {
                if (event.type === "delta") {
                  send({ type: "delta", text: event.text });
                  continue;
                }
                send({
                  type: "done",
                  reply: event.reply,
                  suggestions: event.suggestions,
                  ready_to_propose: event.readyToPropose,
                  content_mode: event.contentMode,
                  language_change: event.languageChange,
                  metadata_valid: event.metadataValid,
                  ...(event.recoveryRequired ? { recovery_required: true } : {}),
                  diagnostics: canDebug ? serializeDiagnostics(event.diagnostics) : null,
                });
                break;
              }
            } catch (err) {
              const response = wordChatErrorResponse(err, { includeDetail: canDebug });
              send({ type: "error", status: response.status, ...await response.json() });
            } finally {
              if (!done) controller.close();
              done = true;
            }
          },
        }),
        {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        },
      );
    }

    const result = await runChatTurn({
      userId: user.id,
      sessionId,
      languageFrom,
      languageTo,
      // The chat is written in the language the learner already knows.
      chatLanguage: normalizeLanguageCode(body.chat_language) || languageFrom,
      addressRegister: sanitizeAddressRegister(body.address_register),
      salutationGender: sanitizeSalutationGender(body.salutation_gender),
      languageLevel: sanitizeLanguageLevel(body.language_level),
      brief,
      messages,
      model: canDebug ? resolveSelectedModel(body.model, WORD_CHAT_CHAT_MODEL) : undefined,
      includeRequest: canDebug,
      signal: request.signal,
    });

    return NextResponse.json({
      reply: result.reply,
      ...(result.recoveryRequired ? { recovery_required: true } : {}),
      suggestions: result.suggestions,
      ready_to_propose: result.readyToPropose,
      content_mode: result.contentMode,
      language_change: result.languageChange,
      diagnostics: canDebug ? serializeDiagnostics(result.diagnostics) : null,
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
