import { NextResponse, type NextRequest } from "next/server";
import { PROTECTED_PREFIXES, SESSION_COOKIE } from "@/lib/auth/constants";
import { isFirebaseConfigured } from "@/lib/env";

/**
 * Fast first-line redirect for signed-out visitors. This only checks that a
 * session cookie EXISTS — the cookie is cryptographically verified (and checked
 * for revocation) server-side in requireViewer() and in every API route.
 */
export function middleware(req: NextRequest) {
  if (!isFirebaseConfigured()) return NextResponse.next(); // preview mode
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  // Expose the requested path to server components so a server-side rejection
  // (forged/expired/revoked cookie) can send the user back here after login.
  const headers = new Headers(req.headers);
  headers.set("x-fg-pathname", pathname + search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|icon.svg|manifest.webmanifest|favicon.ico).*)"],
};
