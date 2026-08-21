import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import {
  MAX_SIMILAR_ITEMS,
  proposeSimilarWords,
} from "@/features/word-chat/server/similar";
import {
  getMonthlyItemUsage,
  reserveChatTurn,
} from "@/features/word-chat/server/rate-limit";
import {
  MAX_WORD_CHAT_ID_CHARS,
  MAX_WORD_CHAT_ITEM_CHARS,
  WORD_CHAT_PROPOSAL_MODEL,
  canSeeWordChatDiagnostics,
  resolveSelectedModel,
} from "@/features/word-chat/server/config";
import { serializeDiagnostics } from "@/features/word-chat/server/diagnostics";
import { assertWordChatSpendAvailable } from "@/features/word-chat/server/usage";
import { wordChatErrorResponse } from "../errors";

export const runtime = "nodejs";

/**
 * Confusable neighbours for one studied pair.
 *
 * Its own route rather than a flavour of `/propose`: the proposal endpoint
 * builds a first study set from a conversation, and this asks a much smaller
 * question about a single word the learner is looking at right now. It is
 * metered the same way — a turn from the chat allowance, and the monthly item
 * cap still gates what can be saved.
 */
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
  const seedKnown =
    typeof body.seed_known === "string"
      ? body.seed_known.trim().slice(0, MAX_WORD_CHAT_ITEM_CHARS)
      : "";
  const seedTarget =
    typeof body.seed_target === "string"
      ? body.seed_target.trim().slice(0, MAX_WORD_CHAT_ITEM_CHARS)
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
  if (!seedKnown || !seedTarget) {
    return NextResponse.json(
      { error: "seed_known and seed_target are required" },
      { status: 400 },
    );
  }

  const role = user.userRole === "editor" ? "editor" : "user";
  const canDebug = canSeeWordChatDiagnostics(role);

  try {
    await assertWordChatSpendAvailable(user.id);
    await reserveChatTurn({ userId: user.id, sessionId, role });

    const usage = await getMonthlyItemUsage({ userId: user.id, role });
    const remaining = Math.max(0, usage.limit - usage.used);
    if (remaining === 0) {
      return NextResponse.json(
        { error: `You've reached this month's limit of ${usage.limit} new words.` },
        { status: 429 },
      );
    }

    const proposal = await proposeSimilarWords({
      userId: user.id,
      sessionId,
      languageFrom,
      languageTo,
      chatLanguage: normalizeLanguageCode(body.chat_language) || languageFrom,
      seed: { known: seedKnown, target: seedTarget },
      count: Math.min(MAX_SIMILAR_ITEMS, remaining),
      model: canDebug ? resolveSelectedModel(body.model, WORD_CHAT_PROPOSAL_MODEL) : undefined,
      includeRequest: canDebug,
    });

    return NextResponse.json({
      diagnostics: canDebug ? serializeDiagnostics(proposal.diagnostics) : null,
      items: proposal.items.map((item) => ({
        text_known: item.known,
        text_target: item.target,
      })),
    });
  } catch (err) {
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
