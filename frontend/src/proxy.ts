import { NextResponse, type NextRequest } from "next/server";

// Fast, optimistic routing on the presence of the session cookie. The API still checks the
// session on every request, so a stale or forged cookie just ends at the login screen.
const APP = ["/today", "/practice", "/progress", "/settings"];
const AUTH = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has("cb_session");

  if (!signedIn && APP.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/" || AUTH.includes(pathname))) {
    return NextResponse.redirect(new URL("/today", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/signup", "/today/:path*", "/practice/:path*", "/progress/:path*", "/settings/:path*"],
};
