import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getListById, setItemComment, updateItemTranslations } from "@/lib/db";
import { makeManualComment } from "@/lib/word-item-comment";

type RouteContext = { params: Promise<{ id: string }> };

type TranslationEntry = {
  id: string;
  text_target?: string | null;
  text_known?: string | null;
  status: "translated" | "manual";
  // Optional manual study-note edit. A string sets/overwrites the manual
  // comment; explicit null clears it. Omitted = leave the comment untouched.
  comment?: string | null;
  // Owner/editor toggle for case-insensitive progress matching on this item.
  ignore_case?: boolean;
};

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

  const body = await request.json();
  const { translations } = body as { translations?: TranslationEntry[] };

  if (!translations || !Array.isArray(translations)) {
    return NextResponse.json(
      { error: "translations array is required" },
      { status: 400 },
    );
  }

  // Filter to entries that have a side update or a comment edit. `text_target:
  // null` is an intentional clear so target text can be regenerated later.
  const valid = translations.filter(
    (t) =>
      t.id &&
      (Object.prototype.hasOwnProperty.call(t, "text_target") ||
        Object.prototype.hasOwnProperty.call(t, "text_known") ||
        Object.prototype.hasOwnProperty.call(t, "comment") ||
        Object.prototype.hasOwnProperty.call(t, "ignore_case")),
  );
  const skipped = translations.length - valid.length;

  // Persist manual study-note edits. A string sets/overwrites the manual
  // comment (source:"manual", editedAt now); explicit null clears it.
  const commentEdits = valid.filter((t) =>
    Object.prototype.hasOwnProperty.call(t, "comment"),
  );
  for (const t of commentEdits) {
    const next =
      typeof t.comment === "string" ? makeManualComment(t.comment) : null;
    await setItemComment(t.id, next);
  }

  const fieldEdits = valid.filter(
    (t) =>
      Object.prototype.hasOwnProperty.call(t, "text_target") ||
      Object.prototype.hasOwnProperty.call(t, "text_known") ||
      Object.prototype.hasOwnProperty.call(t, "ignore_case"),
  );
  if (fieldEdits.length > 0) {
    await updateItemTranslations(
      fieldEdits.map((t) => {
        const hasTextEdit =
          Object.prototype.hasOwnProperty.call(t, "text_target") ||
          Object.prototype.hasOwnProperty.call(t, "text_known");
        const update: {
          id: string;
          textTarget?: string | null;
          textKnown?: string;
          translationStatus?: "translated" | "manual";
          ignoreCase?: boolean;
        } = {
          id: t.id,
          // Only stamp translation status when the text actually changed — an
          // ignore_case-only toggle must not flip a translated item to manual.
          ...(hasTextEdit ? { translationStatus: t.status ?? "manual" } : {}),
        };
        if (Object.prototype.hasOwnProperty.call(t, "text_target")) {
          update.textTarget = t.text_target ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(t, "text_known")) {
          // `text_known` is NOT NULL in the schema; an explicit null is an
          // intentional clear, stored as an empty string for regeneration.
          if (t.text_known === null) {
            update.textKnown = "";
          } else if (t.text_known) {
            update.textKnown = t.text_known;
          }
        }
        if (Object.prototype.hasOwnProperty.call(t, "ignore_case")) {
          update.ignoreCase = Boolean(t.ignore_case);
        }
        return update;
      }),
    );
  }

  return NextResponse.json({ updated: valid.length, skipped });
}
