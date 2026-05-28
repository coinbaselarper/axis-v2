import yts from "yt-search";
import {
  cacheDelete,
  classifyYtdlError,
  fetchWithTimeout,
  resolveAudioUrl,
} from "../../../_lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ artist: string; title: string }> };

type YtSearchVideo = {
  videoId: string;
  title?: string;
  author?: { name?: string };
};

export async function GET(req: Request, ctx: Ctx) {
  const { artist: artistParam, title: titleParam } = await ctx.params;
  const artistName = decodeURIComponent(artistParam);
  const trackTitle = decodeURIComponent(titleParam);
  let videoId: string | undefined;

  try {
    const { videos } = (await yts(`${artistName} ${trackTitle} official audio`)) as {
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
      videoId = video.videoId;
      try {
        return await streamAudio(req, videoId, artistName, trackTitle);
      } catch (err) {
        const { skip } = classifyYtdlError(err);
        const firstLine = (err as Error)?.message?.split("\n")[0];
        console.warn(`[song] skipping ${videoId}: ${firstLine}`);
        lastError = err;
        if (!skip) break;
      }
    }

    return videoErrorResponse(lastError, videoId);
  } catch (err) {
    return videoErrorResponse(err, videoId);
  }
}

function videoErrorResponse(error: unknown, videoId?: string) {
  const { status, message } = classifyYtdlError(error);
  console.error(
    `[song] error for ${videoId ?? "unknown"}: ${status} - ${(error as Error)?.message ?? error}`,
  );
  return Response.json(
    { error: message, videoId, timestamp: new Date().toISOString() },
    { status },
  );
}

async function streamAudio(
  req: Request,
  videoId: string,
  artistName: string,
  trackTitle: string,
  allowRetry = true,
): Promise<Response> {
  const { url: rawAudioUrl, mimeType, http_headers: formatHeaders } = await resolveAudioUrl(videoId);

  const rangeHeader = req.headers.get("range");
  const fetchHeaders: Record<string, string> = {
    ...formatHeaders,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const cdnResponse = await fetchWithTimeout(rawAudioUrl, { headers: fetchHeaders }, 30_000);

  if ((cdnResponse.status === 403 || cdnResponse.status === 404) && allowRetry) {
    console.warn(`[song] CDN ${cdnResponse.status} for ${videoId}, busting cache and retrying`);
    cacheDelete(videoId);
    return streamAudio(req, videoId, artistName, trackTitle, false);
  }

  if (!cdnResponse.ok && cdnResponse.status !== 206) {
    throw new Error(`CDN fetch failed with status ${cdnResponse.status}`);
  }
  if (!cdnResponse.body) {
    throw new Error("CDN response has no readable body");
  }

  const headers = new Headers();
  for (const h of ["content-length", "content-range", "accept-ranges", "content-type"]) {
    const v = cdnResponse.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("Content-Type", mimeType);
  headers.set("Cache-Control", "public, max-age=3600");
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");

  console.log(`[song] streaming "${artistName} - ${trackTitle}" via ${videoId} (${mimeType})`);
  return new Response(cdnResponse.body, {
    status: cdnResponse.status,
    headers,
  });
}
