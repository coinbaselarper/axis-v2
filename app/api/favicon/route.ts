import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAVICON_SERVICE =
  process.env.FAVICON_SERVICE_URL || "https://www.google.com/s2/favicons";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
};

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const raw = params.get("url") || params.get("domain");
  const sizeParam = Number(params.get("size") || params.get("sz") || 64);
  const size = Number.isFinite(sizeParam) ? Math.min(Math.max(sizeParam, 16), 256) : 64;
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 });

  let host: string;
  try {
    host = raw.includes("://") ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
  } catch {
    return NextResponse.json({ error: "Bad url" }, { status: 400 });
  }
  if (!host) return NextResponse.json({ error: "Bad url" }, { status: 400 });

  const upstream = `${FAVICON_SERVICE}?domain=${encodeURIComponent(host)}&sz=${size}`;
  try {
    const res = await fetch(upstream);
    if (!res.ok || !res.body) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 502 });
    }
    const headers = new Headers(CACHE_HEADERS);
    const ct = res.headers.get("content-type");
    headers.set("Content-Type", ct ?? "image/png");
    return new Response(res.body, { headers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 502 },
    );
  }
}
