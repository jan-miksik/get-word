import { NextRequest, NextResponse } from "next/server";
import {
  resolveAuthenticatedUser,
  isEditor,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth";
import { listSchoolSummaries } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** GET /api/admin/schools — schools with current seat usage. Editor-only. */
export async function GET(request: NextRequest) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return withNoStore(unauthorizedResponse());
  if (!isEditor(user)) return withNoStore(forbiddenResponse());

  try {
    const schools = await listSchoolSummaries();
    return NextResponse.json({ schools }, { headers: NO_STORE });
  } catch (error) {
    console.error("Failed to list schools", error);
    return NextResponse.json(
      { error: "Failed to load schools" },
      { status: 500, headers: NO_STORE },
    );
  }
}
