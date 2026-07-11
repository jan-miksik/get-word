import { NextRequest, NextResponse } from "next/server";
import { getListById } from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
  isEditor,
} from "@/lib/auth";
import { scanListAudio, type AudioSide } from "@/features/audio/server/repair/scan-list-audio";

type RouteContext = { params: Promise<{ id: string }> };

function canRepairList(
  list: NonNullable<Awaited<ReturnType<typeof getListById>>>,
  user: NonNullable<Awaited<ReturnType<typeof resolveUserFromRequest>>>,
) {
  // The owner can scan/repair their own list; curated/recommended global lists are
  // editor-only. A bare listId (e.g. a subscriber) never grants access.
  if (list.isCommon || list.isRecommended) return isEditor(user);
  return list.ownerId === user.id;
}

function parseSide(value: unknown): AudioSide | "both" {
  return value === "target" || value === "known" ? value : "both";
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (!canRepairList(list, user)) {
    return forbiddenResponse("Not authorized to scan this list");
  }

  const body = await request.json().catch(() => ({}));
  const side = parseSide((body as { side?: unknown }).side);

  const flagged = await scanListAudio(id, { side });
  return NextResponse.json({ flagged, scanned_side: side });
}
