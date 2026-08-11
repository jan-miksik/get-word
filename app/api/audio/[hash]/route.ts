import { NextRequest, NextResponse } from "next/server";
import { headAudioByHash, serveAudioByHash } from "@/features/audio/server/serve-audio";

type RouteContext = { params: Promise<{ hash: string }> };

/**
 * HEAD /api/audio/[hash] — existence check.
 *
 * Declared explicitly: left to Next this would run GET and fetch the whole clip
 * out of object storage only to drop the body.
 */
export async function HEAD(_request: NextRequest, context: RouteContext) {
  const { hash } = await context.params;
  const { status, headers } = await headAudioByHash(hash);
  return new NextResponse(null, { status, headers });
}

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
