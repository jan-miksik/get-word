import { NextRequest, NextResponse } from "next/server";
import { serveAudioByHash } from "@/features/audio/server/serve-audio";

type RouteContext = { params: Promise<{ hash: string }> };

/** GET /api/audio/[hash] — serve audio by content hash. */
export async function GET(request: NextRequest, context: RouteContext) {
  const { hash } = await context.params;
  const result = await serveAudioByHash(
    hash,
    request.nextUrl.searchParams.get("debug") === "1",
  );

  if (result.kind === "redirect") {
    return NextResponse.redirect(result.url, {
      status: 302,
      headers: { "Cache-Control": result.cacheControl },
    });
  }
  if (result.kind === "audio") {
    return new NextResponse(result.body, { status: 200, headers: result.headers });
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": result.cacheControl },
  });
}
