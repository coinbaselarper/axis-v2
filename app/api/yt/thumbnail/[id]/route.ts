import { fetchWithTimeout } from "../../lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) {
    return new Response("Invalid id", { status: 400 });
  }

  const candidates = [
    `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/default.jpg`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, {}, 6_000);
      if (res.ok && res.body) {
        const headers = new Headers();
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        headers.set("Content-Type", ct);
        headers.set("Cache-Control", "public, max-age=86400");
        return new Response(res.body, { status: 200, headers });
      }
    } catch {}
  }
  return new Response("Thumbnail not found", { status: 404 });
}
