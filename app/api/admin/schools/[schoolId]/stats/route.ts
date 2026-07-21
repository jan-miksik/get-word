import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { getSchoolUsageStats } from "@/lib/db";
import type { ActivityWindow } from "@/lib/stats/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type RouteContext = { params: Promise<{ schoolId: string }> };

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** GET /api/admin/schools/[schoolId]/stats — one school's usage. Editor-only. */
export async function GET(request: NextRequest, context: RouteContext) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  const { schoolId } = await context.params;
  const activityWindow: ActivityWindow =
    request.nextUrl.searchParams.get("activityWindow") === "calendar" ? "calendar" : "rolling";

  try {
    const stats = await getSchoolUsageStats(schoolId, { activityWindow });
    if (!stats) {
      return NextResponse.json(
        { error: "School not found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(stats, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to get school usage stats", error);
    return NextResponse.json(
      { error: "Failed to load school statistics" },
      { status: 500, headers: NO_STORE },
    );
  }
}
