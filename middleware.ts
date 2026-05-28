import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/api/caddy", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const secret = process.env.INTERNAL_API_KEY;
  if (!secret) return NextResponse.next();

  const cookie = request.cookies.get("internal_key")?.value;
  const header = request.headers.get("x-internal-key");

  if (cookie !== secret && header !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/stream/:path*"],
};
