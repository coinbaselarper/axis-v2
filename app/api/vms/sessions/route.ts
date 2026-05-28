import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";
import { createSession, listSessions } from "@/lib/vms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerFor(req: NextRequest): string {
  const ctx = getRequestSession(req);
  if (ctx) return ctx.user.username;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `anon-${fwd || "local"}`;
}

export async function GET(req: NextRequest) {
  try {
    const { sessions } = await listSessions(ownerFor(req));
    return NextResponse.json({ sessions });
  } catch (e: any) {
    return NextResponse.json({ error: `VM service unreachable: ${e?.message || "unknown"}` }, { status: 502 });
  }
}

type CreateBody = { startUrl?: string; title?: string };

export async function POST(req: NextRequest) {
  let body: CreateBody = {};
  try { body = (await req.json()) as CreateBody; } catch {}

  try {
    const { session } = await createSession(ownerFor(req), body.startUrl, body.title);
    return NextResponse.json({ session }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 502 });
  }
}
