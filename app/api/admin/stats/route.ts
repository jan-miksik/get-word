import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getUsageStats } from "@/lib/db";
import type { ActivityWindow } from "@/lib/db/queries/usage-stats";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** GET /api/admin/stats — aggregate usage statistics. Editor-only. */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const activityWindow: ActivityWindow =
    request.nextUrl.searchParams.get("activityWindow") === "calendar" ? "calendar" : "rolling";

  try {
    const stats = await getUsageStats({ activityWindow });
    return NextResponse.json(stats, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to get usage stats", error);
    return NextResponse.json(
      { error: "Failed to load usage statistics" },
      { status: 500, headers: NO_STORE },
    );
  }
}
