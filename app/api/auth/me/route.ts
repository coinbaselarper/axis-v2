import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = getRequestSession(req);
  if (!ctx) return NextResponse.json({ user: null }, { status: 200 });
  const { user } = ctx;
  return NextResponse.json({
    user: { username: user.username, email: user.email, emailVerifiedAt: user.emailVerifiedAt },
  });
}
