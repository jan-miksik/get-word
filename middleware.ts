import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const userRole = request.cookies.get("wordlink_user_role")?.value;

  if (userRole !== "editor") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/edit/:path*",
};
