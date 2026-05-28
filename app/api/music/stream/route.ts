import { resolveTidalStreamUrl } from "../_tidal";
import yts from "yt-search";
import {
  cacheDelete,
  classifyYtdlError,
  fetchWithTimeout,
  resolveAudioUrl,
} from "../_lib";

export const dynamic = "force-dynamic";

type YtSearchVideo = {
  videoId: string;
  title?: string;
  author?: { name?: string };
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const quality = searchParams.get("quality") ?? "HIGH";
  const artist = searchParams.get("artist")?.trim();
  const title = searchParams.get("title")?.trim();

  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  // Try Tidal proxies first
  try {
    const resolved = await resolveTidalStreamUrl(id, quality);

    const upstreamHeaders: HeadersInit = {};
    const range = req.headers.get("range");
    if (range) upstreamHeaders["range"] = range;

    const upstream = await fetch(resolved.url, { headers: upstreamHeaders });

    const resHeaders = new Headers();
    resHeaders.set(
      "content-type",
      upstream.headers.get("content-type") || resolved.mimeType || "audio/mp4",
    );
    resHeaders.set("accept-ranges", upstream.headers.get("accept-ranges") || "bytes");
    resHeaders.set("cache-control", "no-store");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) resHeaders.set("content-length", contentLength);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) resHeaders.set("content-range", contentRange);

    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  } catch {
    // Tidal failed — fall through to YouTube fallback
  }

  if (!artist || !title) {
    return Response.json({ error: "All music upstreams failed and no artist/title for fallback" }, { status: 502 });
  }

  // YouTube fallback
  try {
    const { videos } = (await yts(`${artist} ${title} official audio`)) as {
      videos: YtSearchVideo[];
    };
    if (!videos?.length) {
      return Response.json({ error: "No YouTube results found" }, { status: 404 });
    }

    const sorted: YtSearchVideo[] = [
      ...videos.filter(
        (v) =>
          v.author?.name?.toLowerCase().includes("topic") ||
          v.title?.toLowerCase().includes("official audio"),
      ),
      ...videos.filter(
        (v) =>
          !v.author?.name?.toLowerCase().includes("topic") &&
          !v.title?.toLowerCase().includes("official audio"),
      ),
    ];

    let lastError: unknown;
    for (const video of sorted.slice(0, 5)) {
      try {
        return await streamYouTube(req, video.videoId);
      } catch (err) {
        const { skip } = classifyYtdlError(err);
        console.warn(`[stream-yt] skipping ${video.videoId}: ${(err as Error)?.message?.split("\n")[0]}`);
        lastError = err;
        if (!skip) break;
      }
    }

    const { status, message } = classifyYtdlError(lastError);
    return Response.json({ error: message }, { status });
  } catch (err) {
    const { status, message } = classifyYtdlError(err);
    return Response.json({ error: message }, { status });
  }
}

async function streamYouTube(req: Request, videoId: string, allowRetry = true): Promise<Response> {
  const { url, mimeType, http_headers: formatHeaders } = await resolveAudioUrl(videoId);

  const fetchHeaders: Record<string, string> = {
    ...formatHeaders,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
  const range = req.headers.get("range");
  if (range) fetchHeaders["Range"] = range;

  const cdnResponse = await fetchWithTimeout(url, { headers: fetchHeaders }, 30_000);

  if ((cdnResponse.status === 403 || cdnResponse.status === 404) && allowRetry) {
    cacheDelete(videoId);
    return streamYouTube(req, videoId, false);
  }

  if (!cdnResponse.ok && cdnResponse.status !== 206) {
    throw new Error(`CDN fetch failed with status ${cdnResponse.status}`);
  }
  if (!cdnResponse.body) throw new Error("CDN response has no readable body");

  const headers = new Headers();
  for (const h of ["content-length", "content-range", "accept-ranges", "content-type"]) {
    const v = cdnResponse.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("Content-Type", mimeType);
  headers.set("Cache-Control", "public, max-age=3600");
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");

  return new Response(cdnResponse.body, { status: cdnResponse.status, headers });
}
