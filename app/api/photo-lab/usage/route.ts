import { NextRequest, NextResponse } from "next/server";
import { getPhotoLabUsage } from "@/features/photo-lab/server/rate-limit";
import { isEditor, resolveUserFromRequest, unauthorizedResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await resolveUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  const usage = await getPhotoLabUsage(user.id, isEditor(user), user.photoLabLimitOverride);
  return NextResponse.json({
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    reset_at: usage.resetAt.toISOString(),
    period: usage.period,
    source: usage.source,
  });
}
