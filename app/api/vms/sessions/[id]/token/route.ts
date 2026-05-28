import { NextRequest, NextResponse } from "next/server";
import { issueWsToken, VM_PUBLIC_WS_URL } from "@/lib/vms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { name?: string };

export async function POST(req: NextRequest, ctxParam: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParam.params;
  let body: Body = {};
  try { body = (await req.json()) as Body; } catch {}
  const name = (body.name || "").trim().slice(0, 24) || "Guest";

  try {
    const { token, expiresInSec, session } = await issueWsToken(id);
    const wsBase = VM_PUBLIC_WS_URL || defaultWsFromReq(req);
    const wsUrl = `${wsBase}/stream?token=${encodeURIComponent(token)}&name=${encodeURIComponent(name)}`;
    return NextResponse.json({ token, wsUrl, expiresInSec, session });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "token failed" }, { status: 502 });
  }
}

function defaultWsFromReq(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || (req.url.startsWith("https") ? "https" : "http");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost";
  const wsProto = proto === "https" ? "wss" : "ws";
  const hostname = host.split(":")[0];
  return `${wsProto}://${hostname}:8080`;
}
