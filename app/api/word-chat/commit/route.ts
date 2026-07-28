import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { commitWordChatSession } from "@/features/word-chat/server/commit";
import { sanitizeMessages } from "@/features/word-chat/server/chat";
import { canSeeWordChatDiagnostics } from "@/features/word-chat/server/config";
import { wordChatErrorResponse } from "../errors";
import type { ReviewItem } from "@/features/word-chat/types";

export const runtime = "nodejs";

type IncomingItem = {
  kind?: unknown;
  text_known?: unknown;
  text_target?: unknown;
  corpus_item_id?: unknown;
  takeover?: unknown;
  audio_asset_id?: unknown;
  known_audio_asset_id?: unknown;
};

function toReviewItem(item: IncomingItem): ReviewItem | null {
  const textKnown = typeof item.text_known === "string" ? item.text_known : "";
  const textTarget = typeof item.text_target === "string" ? item.text_target : "";
  if (!textKnown.trim() || !textTarget.trim()) return null;
  return {
    kind: item.kind === "sentence" ? "sentence" : "word",
    textKnown,
    textTarget,
    ...(typeof item.corpus_item_id === "string" ? { corpusItemId: item.corpus_item_id } : {}),
    ...(item.takeover &&
    typeof item.takeover === "object" &&
    typeof (item.takeover as Record<string, unknown>).sourceItemId === "string" &&
    typeof (item.takeover as Record<string, unknown>).sourceListName === "string"
      ? {
          takeover: {
            sourceItemId: (item.takeover as Record<string, string>).sourceItemId,
            sourceListName: (item.takeover as Record<string, string>).sourceListName,
          },
        }
      : {}),
    audioAssetId: typeof item.audio_asset_id === "string" ? item.audio_asset_id : null,
    knownAudioAssetId:
      typeof item.known_audio_asset_id === "string" ? item.known_audio_asset_id : null,
  };
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = await request.json().catch(() => ({}));
  const creationKey = typeof body.creation_key === "string" ? body.creation_key.trim() : "";
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";

  if (!creationKey) {
    return NextResponse.json({ error: "creation_key is required" }, { status: 400 });
  }
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? (body.items as IncomingItem[]) : [];
  const items = rawItems
    .map(toReviewItem)
    .filter((item): item is ReviewItem => item !== null);

  const role = user.userRole === "editor" ? "editor" : "user";
  const canDebug = canSeeWordChatDiagnostics(role);

  try {
    const result = await commitWordChatSession({
      userId: user.id,
      role,
      request: {
        creationKey,
        sessionId,
        languageFrom: typeof body.language_from === "string" ? body.language_from : "",
        languageTo: typeof body.language_to === "string" ? body.language_to : "",
        baseListId: typeof body.base_list_id === "string" ? body.base_list_id : undefined,
        listName: typeof body.list_name === "string" ? body.list_name : undefined,
        categoryName: typeof body.category_name === "string" ? body.category_name : "",
        reviewLabel: typeof body.review_label === "string" ? body.review_label : undefined,
        isPublic: body.is_public === true,
        reviewOptIn: body.review_opt_in !== false,
        items,
        // Used once, to regenerate the structured brief. Never stored.
        messages: sanitizeMessages(body.messages),
      },
    });

    return NextResponse.json({
      list_id: result.listId,
      category_id: result.categoryId,
      item_count: result.itemCount,
      takeover_count: result.takeoverCount,
      upgraded_takeover_count: result.upgradedTakeoverCount,
      already_committed: result.alreadyCommitted,
      monthly_used: result.monthlyUsed,
      monthly_limit: result.monthlyLimit,
    });
  } catch (err) {
    // Commit is the one step where a failure costs the learner everything they
    // just reviewed, so the cause has to reach whoever is debugging it — the
    // generic sentence alone left "it fell over on save" uninvestigable.
    return wordChatErrorResponse(err, { includeDetail: canDebug });
  }
}
