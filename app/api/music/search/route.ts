import { callMusicApi, toClientTrack, type TidalSearchResp } from "../_tidal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const limit = searchParams.get("limit") ?? "30";

  if (!q) return Response.json({ items: [] });

  try {
    const data = await callMusicApi<TidalSearchResp>("/search/", { s: q, limit: Number(limit) });
    return Response.json(
      { items: (data?.data?.items ?? []).map(toClientTrack) },
      { headers: { "cache-control": "public, max-age=120" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Search failed", items: [] },
      { status: 502 },
    );
  }
}
