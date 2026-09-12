import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRIMARY_HOST = "gamriechalets.co.uk";
const WWW_HOST = `www.${PRIMARY_HOST}`;

// Consolidates every http/https/www variant of the production domain onto
// a single canonical origin (https://gamriechalets.co.uk) in one hop, so
// search engines never see the same page under four different URLs.
// Local dev and Vercel preview deployments (different hostnames) pass
// through untouched.
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";

  if (host !== PRIMARY_HOST && host !== WWW_HOST) {
    return NextResponse.next();
  }

  const isSecure = request.headers.get("x-forwarded-proto") === "https";

  if (host === WWW_HOST || !isSecure) {
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
