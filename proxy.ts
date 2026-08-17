import { NextRequest, NextResponse } from "next/server";
import { handleApiCors } from "@/features/shared/routes/api-cors";
import { GET_WORD_SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes authenticate per request (cookie or bearer). They are matched
  // only so the native client's cross-origin calls get their CORS headers, and
  // must never go through the page auth gate below — that would redirect an
  // unauthenticated API call to the home page instead of returning its 401.
  if (pathname.startsWith("/api/")) {
    return handleApiCors(request);
  }

  const token = request.cookies.get(GET_WORD_SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    if (pathname === "/" || pathname === "/login") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Editor-only page areas. `/admin` used to be absent from both this check
  // and the matcher, so the pages rendered for anyone and the only real
  // barrier was the 403 their API calls came back with.
  if (
    (pathname.startsWith("/edit") || pathname.startsWith("/admin")) &&
    session.userRole !== "editor"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/:path*",
    "/edit/:path*",
    "/admin/:path*",
    "/lists/:path*",
    "/login",
  ],
};
