import { NextRequest, NextResponse } from "next/server";
import { listRooms } from "@/lib/vms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { rooms } = await listRooms();
    return NextResponse.json({ rooms });
  } catch (e: any) {
    return NextResponse.json({ error: `VM service unreachable: ${e?.message || "unknown"}` }, { status: 502 });
  }
}
