import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import {
  applyGeneratedComments,
  getListById,
  getListItems,
} from "@/lib/db";
import { getUserApiKey } from "@/lib/translation";
import {
  generateComments,
  makeServerCommentCaller,
  toGeneratedComment,
  type CommentSourceItem,
} from "@/lib/comment-generation";
import {
  OPENROUTER_API_URL,
  SERVER_AUTOGENERATE_MODEL,
} from "@/features/learning/onboarding/server/autogenerate-common-list/config";
import { normalizeLanguageCode } from "@/lib/i18n/languages";
import type { WordItemComment } from "@/lib/word-item-comment";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Best-effort, idempotent comment generation for a list. Client-triggered AFTER
 * the list is saved (no serverless fire-and-forget). Only fills items whose
 * comment is empty or already `generated`; manual comments are never touched.
 * Safe to retry / resume. Permission-checked: list owner only.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id: listId } = await context.params;
  const list = await getListById(listId);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Not list owner");
  }

  const languageFrom = normalizeLanguageCode(list.languageFrom);
  const languageTo = normalizeLanguageCode(list.languageTo);

  // Prefer the user's BYOK OpenRouter key; fall back to the server key.
  const userKey = await getUserApiKey(user.id, "openrouter");
  const apiKey = userKey ?? process.env.OPENROUTER_SERVER_API_KEY ?? null;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenRouter key available for comment generation." },
      { status: 400 },
    );
  }

  const items = await getListItems(listId);
  // Only generate for fillable rows: empty comment or an existing generated one.
  const fillable = items.filter(
    (item) =>
      item.textKnown &&
      item.textTarget &&
      ((item.comment as WordItemComment | null)?.source ?? "generated") ===
        "generated",
  );
  if (fillable.length === 0) {
    return NextResponse.json({ generated: 0, written: 0 });
  }

  const sourceItems: CommentSourceItem[] = fillable.map((item, index) => ({
    sourceIndex: index,
    known: item.textKnown,
    target: item.textTarget as string,
  }));

  const deps = makeServerCommentCaller({
    apiKey,
    model: SERVER_AUTOGENERATE_MODEL,
    apiUrl: OPENROUTER_API_URL,
  });

  let generated: Awaited<ReturnType<typeof generateComments>>;
  try {
    generated = await generateComments(
      { languageFrom, languageTo, items: sourceItems },
      deps,
    );
  } catch (error) {
    // Best-effort: never surface a hard failure. Log in dev only.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[generate-comments] generation failed", error);
    }
    return NextResponse.json({ generated: 0, written: 0 });
  }

  // Attach by validated stable key: map sourceIndex -> the same item we sent.
  const byItemId = new Map<string, WordItemComment>();
  for (const result of generated) {
    const sourceItem = fillable[result.sourceIndex];
    if (!sourceItem) continue;
    // Guard against drift: the row must still be the pair we sent.
    if (
      sourceItem.textKnown !== sourceItems[result.sourceIndex]?.known ||
      sourceItem.textTarget !== sourceItems[result.sourceIndex]?.target
    ) {
      continue;
    }
    const comment = toGeneratedComment(result);
    if (comment) byItemId.set(sourceItem.id, comment);
  }

  const written = await applyGeneratedComments(listId, byItemId);
  // Return the generated note text per item so the editor can show the new
  // notes immediately without a refetch. Only non-manual rows are present here
  // (manual comments were excluded from `fillable`), so this is safe to merge.
  const comments: Record<string, string> = {};
  for (const [itemId, comment] of byItemId) {
    comments[itemId] = comment.text;
  }
  return NextResponse.json({ generated: generated.length, written, comments });
}
