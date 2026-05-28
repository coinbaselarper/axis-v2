import yts from "yt-search";
import { fetchWithTimeout } from "../../../lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type YtSearchChannel = { image?: string };

export async function GET(_req: Request, ctx: Ctx) {
  const { id: channelId } = await ctx.params;

  try {
    const results = (await yts({ query: channelId })) as {
      channels: YtSearchChannel[];
    };
    const channel = results.channels?.[0];
    if (!channel?.image) {
      return new Response("Channel icon not found", { status: 404 });
    }
    const res = await fetchWithTimeout(channel.image, {}, 8_000);
    if (!res.ok || !res.body) {
      return new Response("Error proxying profile icon", { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", res.headers.get("content-type") ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(res.body, { status: 200, headers });
  } catch {
    return new Response("Error proxying profile icon", { status: 500 });
  }
}
