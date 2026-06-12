import { NextRequest, NextResponse } from "next/server";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getListById, updateItemTranslations } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

type TranslationEntry = {
  id: string;
  text_target?: string | null;
  text_known?: string;
  status: "translated" | "manual";
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

  // Filter to entries that have a side update. `text_target: null` is an
  // intentional clear so target text can be regenerated later.
  const valid = translations.filter(
    (t) =>
      t.id &&
      (Object.prototype.hasOwnProperty.call(t, "text_target") ||
        Object.prototype.hasOwnProperty.call(t, "text_known")),
  );
  const skipped = translations.length - valid.length;

  if (valid.length > 0) {
    await updateItemTranslations(
      valid.map((t) => {
        const update: {
          id: string;
          textTarget?: string | null;
          textKnown?: string;
          translationStatus: "translated" | "manual";
        } = {
          id: t.id,
          translationStatus: t.status ?? "manual",
        };
        if (Object.prototype.hasOwnProperty.call(t, "text_target")) {
          update.textTarget = t.text_target ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(t, "text_known") && t.text_known) {
          update.textKnown = t.text_known;
        }
        return update;
      }),
    );
  }

  return NextResponse.json({ updated: valid.length, skipped });
}
