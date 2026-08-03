import { NextRequest, NextResponse } from "next/server";
import { getListById, getOrCreateListShareToken } from "@/lib/db";
import {
  canPublishPublicList,
  resolveUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
  isEditor,
} from "@/lib/auth";
import { getRequestPublicOrigin } from "@/features/auth/app-url";

type RouteContext = { params: Promise<{ id: string }> };

/** Build the absolute /join/{token} link students open. */
function buildShareUrl(request: NextRequest, token: string): string {
  return `${getRequestPublicOrigin(request)}/join/${token}`;
}

/**
 * POST /api/lists/[id]/share — returns the list's share link, generating a
 * token on first call (get-or-create, transactional so a double-click can't
 * mint two tokens). Never exposes the token in any other response; this
 * endpoint is the only read path for it.
 *
 * Access: the owner (and editors for common lists) can always fetch it. A
 * public list's link is fetchable by anyone signed in — the list is already
 * openly readable, so the /join link is a discovery aid, not a secret. Private
 * lists stay owner/editor-only, where the token is a real access capability.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const list = await getListById(id);
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const canShare =
    list.isPublic ||
    list.ownerId === user.id ||
    (list.isCommon && isEditor(user));
  if (!canShare) {
    return forbiddenResponse("Only the list owner can share this list");
  }

  const token = await getOrCreateListShareToken(id);
  if (!token) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({
    listId: id,
    token,
    url: buildShareUrl(request, token),
    isPublic: list.isPublic,
    // Lets the share dialog hide the make-public action for callers the PUT
    // route would refuse, instead of offering a button that always fails.
    canPublish: canPublishPublicList(user),
  });
}
