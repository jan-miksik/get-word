import { NextRequest, NextResponse } from "next/server";
import { verifySession, WORDLINK_SESSION_COOKIE_NAME } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(WORDLINK_SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    if (pathname === "/" || pathname === "/login") {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/edit") && session.userRole !== "editor") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/edit/:path*",
    "/lists/:path*",
    "/login",
  ],
};
