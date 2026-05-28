import { resolveTidalStreamUrl } from "../_tidal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const quality = searchParams.get("quality") ?? "HIGH";

  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  try {
    const r = await resolveTidalStreamUrl(id, quality);
    return Response.json(r);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Music track failed" },
      { status: 502 },
    );
  }
}
