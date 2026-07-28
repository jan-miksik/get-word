import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import { translateSelection } from "@/features/word-chat/server/translate";
import { serializeDiagnostics } from "@/features/word-chat/server/diagnostics";
import {
  WORD_CHAT_TRANSLATION_MODEL,
  MAX_WORD_CHAT_ID_CHARS,
  MAX_WORD_CHAT_ITEM_CHARS,
  canSeeWordChatDiagnostics,
  resolveSelectedModel,
} from "@/features/word-chat/server/config";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

type IncomingItem = {
  kind?: unknown;
  text?: unknown;
  corpus_item_id?: unknown;
  takeover_candidate?: unknown;
};

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

  const rawItems = Array.isArray(body.items) ? (body.items as IncomingItem[]) : [];
  const items = rawItems
    .map((item) => ({
      kind: item.kind === "sentence" ? ("sentence" as const) : ("word" as const),
      text:
        typeof item.text === "string"
          ? item.text.slice(0, MAX_WORD_CHAT_ITEM_CHARS)
          : "",
      ...(typeof item.corpus_item_id === "string"
        ? { corpusItemId: item.corpus_item_id }
        : {}),
      ...(item.takeover_candidate &&
      typeof item.takeover_candidate === "object" &&
      typeof (item.takeover_candidate as Record<string, unknown>).sourceItemId === "string" &&
      typeof (item.takeover_candidate as Record<string, unknown>).sourceListName === "string"
        ? {
            takeoverCandidate: {
              sourceItemId: (item.takeover_candidate as Record<string, string>).sourceItemId,
              sourceListName: (item.takeover_candidate as Record<string, string>).sourceListName,
            },
          }
        : {}),
    }))
    .filter((item) => item.text.trim().length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: "items is required" }, { status: 400 });
  }

  const isEditor = user.userRole === "editor";
  const canDebug = canSeeWordChatDiagnostics(isEditor ? "editor" : "user");

  try {
    const { rows, diagnostics } = await translateSelection({
      userId: user.id,
      role: isEditor ? "editor" : "user",
      sessionId,
      languageFrom,
      languageTo,
      items,
      model: canDebug
        ? resolveSelectedModel(body.model, WORD_CHAT_TRANSLATION_MODEL)
        : undefined,
      includeRequest: canDebug,
    });

    return NextResponse.json({
      items: rows.map((row) => ({
        kind: row.kind,
        text_known: row.textKnown,
        text_target: row.textTarget,
        corpus_item_id: row.corpusItemId ?? null,
        audio_asset_id: row.audioAssetId ?? null,
        audio_hash: row.audioHash ?? null,
        known_audio_asset_id: row.knownAudioAssetId ?? null,
        warnings: row.warnings,
        reused: row.reused,
        takeover: row.takeover ?? null,
      })),
      // The learner-facing line in Review only needs model + cost; the editor
      // panel gets the full record, prompts included.
      translation_diagnostics: {
        model: diagnostics.model,
        input_tokens: diagnostics.inputTokens,
        output_tokens: diagnostics.outputTokens,
        estimated_cost_usd: diagnostics.estimatedCostUsd,
      },
      diagnostics: canDebug ? serializeDiagnostics(diagnostics) : null,
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
