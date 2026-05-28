import {
  classifyYtdlError,
  fetchWithTimeout,
  resolveVideoUrl,
  videoCacheDelete,
} from "../../lib";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    return await streamVideo(req, id);
  } catch (err) {
    const { status, message } = classifyYtdlError(err);
    return Response.json(
      { error: message, videoId: id },
      { status },
    );
  }
}

async function streamVideo(
  req: Request,
  videoId: string,
  allowRetry = true,
): Promise<Response> {
  const { url: rawUrl, mimeType, http_headers: formatHeaders } =
    await resolveVideoUrl(videoId);

  const rangeHeader = req.headers.get("range");
  const fetchHeaders: Record<string, string> = {
    ...formatHeaders,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const cdnRes = await fetchWithTimeout(
    rawUrl,
    { headers: fetchHeaders },
    30_000,
  );

  if ((cdnRes.status === 403 || cdnRes.status === 404) && allowRetry) {
    videoCacheDelete(videoId);
    return streamVideo(req, videoId, false);
  }

  if (!cdnRes.ok && cdnRes.status !== 206) {
    throw new Error(`CDN fetch failed with status ${cdnRes.status}`);
  }
  if (!cdnRes.body) throw new Error("CDN response has no readable body");

  const headers = new Headers();
  for (const h of [
    "content-length",
    "content-range",
    "accept-ranges",
    "content-type",
  ]) {
    const v = cdnRes.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("Content-Type", mimeType);
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=1800");

  return new Response(cdnRes.body, {
    status: cdnRes.status,
    headers,
  });
}
