import { NextRequest, NextResponse } from "next/server";
import { destroySession, getDb } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("axis_session")?.value;
  if (token) destroySession(getDb(), token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("axis_session", "", { path: "/", maxAge: 0 });
  return res;
}
