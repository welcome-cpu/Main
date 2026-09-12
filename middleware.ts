import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRIMARY_HOST = "gamriechalets.co.uk";
const WWW_HOST = `www.${PRIMARY_HOST}`;
// Vercel's stable alias for whichever deployment is currently Production —
// unlike per-branch preview URLs, this one also gets VERCEL_ENV=production,
// so it stays indexable and duplicates the real domain unless redirected.
const VERCEL_PROD_ALIAS = "main-chi-one.vercel.app";

// Consolidates every http/https/www/vercel.app variant of the production
// deployment onto a single canonical origin (https://gamriechalets.co.uk)
// in one hop, so search engines never see the same page under multiple
// URLs. Local dev and per-branch Vercel preview deployments (different
// hostnames) pass through untouched.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (host !== PRIMARY_HOST && host !== WWW_HOST && host !== VERCEL_PROD_ALIAS) {
    return NextResponse.next();
  }

  const isSecure = request.headers.get("x-forwarded-proto") === "https";

  if (host !== PRIMARY_HOST || !isSecure) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = PRIMARY_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
