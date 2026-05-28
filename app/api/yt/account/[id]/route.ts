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

type YtSearchChannel = {
  name?: string;
  url?: string;
  subCountLabel?: string;
  videoCount?: number;
  image?: string;
};

export async function GET(_req: Request, ctx: Ctx) {
  const { id: channelId } = await ctx.params;

  try {
    const results = (await yts({ query: channelId })) as {
      channels: YtSearchChannel[];
      videos: YtSearchVideo[];
    };
    const channel = results.channels?.[0];
    if (!channel) {
      return Response.json({ error: "Channel not found" }, { status: 404 });
    }

    const videos = (results.videos ?? []).map((v) => ({
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
      name: channel.name,
      id: channelId,
      url: channel.url,
      profileIcon: `/api/yt/media/account/${channelId}`,
      subscriberCount: channel.subCountLabel,
      videoCount: channel.videoCount,
      topVideos: videos.slice(0, 100),
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch account info", details: (error as Error).message },
      { status: 500 },
    );
  }
}
