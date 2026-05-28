import { NextRequest, NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth";
import { destroySession } from "@/lib/vms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ownerFor(req: NextRequest): string {
  const ctx = getRequestSession(req);
  if (ctx) return ctx.user.username;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `anon-${fwd || "local"}`;
}

export async function DELETE(req: NextRequest, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  try {
    const ok = await destroySession(ownerFor(req), id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "destroy failed" }, { status: 502 });
  }
}
