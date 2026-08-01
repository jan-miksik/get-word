import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import {
  MAX_SAVE_ITEMS,
  PhotoLabSaveError,
  describePhotoLabSaveList,
  savePhotoLabWords,
  type PhotoLabSaveItem,
} from "@/features/photo-lab/server/save-to-list";

export const runtime = "nodejs";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function errorResponse(err: unknown) {
  if (err instanceof PhotoLabSaveError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

/** Names the list this direction saves into, so the dialog can show it up front. */
export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const languageFrom = request.nextUrl.searchParams.get("from") ?? "";
  const languageTo = request.nextUrl.searchParams.get("to") ?? "";

  try {
    const list = await describePhotoLabSaveList({
      userId: user.id,
      languageFrom,
      languageTo,
    });
    return NextResponse.json({ list_name: list.name, list_exists: list.exists });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const body = (await request.json().catch(() => null)) as {
    language_from?: unknown;
    language_to?: unknown;
    category_name?: unknown;
    items?: unknown;
  } | null;

  if (typeof body?.language_from !== "string" || typeof body.language_to !== "string") {
    return badRequest("language_from and language_to are required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items array is required and must not be empty");
  }
  if (body.items.length > MAX_SAVE_ITEMS) {
    return badRequest(`Maximum ${MAX_SAVE_ITEMS} items per request`);
  }

  const items: PhotoLabSaveItem[] = [];
  for (const raw of body.items) {
    const { known, target, audio_hash: audioHash } = (raw ?? {}) as {
      known?: unknown;
      target?: unknown;
      audio_hash?: unknown;
    };
    if (typeof known !== "string" || typeof target !== "string") {
      return badRequest("each item needs known and target strings");
    }
    items.push({
      known,
      target,
      audioHash: typeof audioHash === "string" ? audioHash : null,
    });
  }

  try {
    const result = await savePhotoLabWords({
      userId: user.id,
      languageFrom: body.language_from,
      languageTo: body.language_to,
      categoryName: typeof body.category_name === "string" ? body.category_name : "",
      items,
    });
    return NextResponse.json({
      list_id: result.listId,
      list_name: result.listName,
      category_id: result.categoryId,
      added_count: result.addedCount,
      duplicate_count: result.duplicateCount,
      items: result.items.map((item) => ({
        known: item.known,
        target: item.target,
        outcome: item.outcome,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
