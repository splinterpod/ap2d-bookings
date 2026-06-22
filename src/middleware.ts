import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

// Lightweight login wall: redirects users with no session cookie away from
// protected pages. Session validity and role checks are still enforced in each
// page/server action (this only avoids rendering protected shells for guests).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has("ap2d_session");

  if (!hasSession && !PUBLIC_PATHS.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Apply to all routes except Next internals, static assets, and the cron endpoint.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.).*)"],
};
