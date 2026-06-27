import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";
import { getOwnedListsWithSubscriberCounts } from "@/lib/db";

/**
 * GET /api/auth/account/deletion-preview
 *
 * Advisory summary of what an account deletion would do, used to drive the
 * delete-account modal copy. The authoritative partition is recomputed inside
 * the deletion transaction (this preview can be stale by the time the user
 * confirms). A list is *kept* (anonymized, handed to Get Word) when it has other
 * subscribers or is editor-curated (recommended/common); everything else is
 * deleted with the account.
 */
export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const ownedLists = await getOwnedListsWithSubscriberCounts(user.id);

  const keptLists = ownedLists
    .filter(
      (list) =>
        list.subscriberCount > 0 || list.isRecommended || list.isCommon,
    )
    .map((list) => ({ name: list.name, subscriberCount: list.subscriberCount }));

  return NextResponse.json({
    keptLists,
    deletedListCount: ownedLists.length - keptLists.length,
    // Tells the client which confirmation phrase to require.
    requiresEmailConfirmation: Boolean(user.email),
  });
}
