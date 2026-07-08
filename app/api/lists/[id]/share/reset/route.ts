import { NextRequest, NextResponse } from "next/server";
import {
  getListById,
  resetListShareTokenAndDeleteSubscriptions,
} from "@/lib/db";
import {
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getRequestPublicOrigin } from "@/features/auth/app-url";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/lists/[id]/share/reset — owner-only. Rotates the share token
 * (invalidating the old link) and, for private lists, drops all existing
 * subscriptions in the same transaction, cutting off current students. Public
 * lists keep their subscribers — only the old URL stops working. Returns the
 * fresh link so the owner can re-share.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if (list.ownerId !== user.id) {
    return forbiddenResponse("Only the owner can reset this share link");
  }

  const result = await resetListShareTokenAndDeleteSubscriptions(id);
  if (!result) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({
    listId: id,
    token: result.token,
    url: `${getRequestPublicOrigin(request)}/join/${result.token}`,
    revokedSubscribers: result.revokedSubscribers,
    isPublic: list.isPublic,
  });
}
