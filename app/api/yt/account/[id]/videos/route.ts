import yts from "yt-search";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type YtSearchVideo = {
  videoId: string;
  title?: string;
  description?: string;
  timestamp?: string;
  duration?: { seconds?: number };
  ago?: string;
  views?: number;
};

export async function GET(req: Request, ctx: Ctx) {
  const { id: channelId } = await ctx.params;
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  try {
    const results = (await yts({ query: channelId })) as {
      videos: YtSearchVideo[];
    };
    const allVideos = (results.videos ?? []).map((v) => ({
      id: v.videoId,
      title: v.title,
      description: v.description,
      timestamp: v.timestamp,
      duration: v.duration?.seconds,
      age: v.ago,
      views: v.views,
      thumbnail: `/api/yt/thumbnail/${v.videoId}`,
      mediaUrl: `/api/yt/id/${v.videoId}`,
    }));

    return Response.json({
      channelId,
      totalFound: allVideos.length,
      limit,
      offset,
      videos: allVideos.slice(offset, offset + limit),
    });
  } catch (error) {
    return Response.json(
      {
        error: "Failed to fetch creator videos",
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
