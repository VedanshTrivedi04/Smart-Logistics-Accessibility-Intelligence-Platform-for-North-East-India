import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/login", "/auth/", "/offline", "/_next/", "/api/", "/health", "/public"];
// Exact-match public paths: "/" cannot go in PUBLIC_PREFIXES (prefix-matching "/" would make
// every route public), and the citizen-facing pages must load with no session cookie at all.
const PUBLIC_FILES = new Set(["/", "/sw.js", "/manifest.webmanifest", "/icon.svg", "/favicon.ico", "/robots.txt"]);

/**
 * Early redirect for visitors with no session cookie. This only improves the first paint:
 * the cookie is opaque here, and the API still validates it on every request.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.has("ner_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
