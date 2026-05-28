import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  const secret = process.env.INTERNAL_API_KEY;

  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Invalid key" }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("internal_key", key, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
