import yts from "yt-search";

export const dynamic = "force-dynamic";

type YtSearchVideo = {
  videoId: string;
  title?: string;
  description?: string;
  timestamp?: string;
  duration?: { seconds?: number };
  ago?: string;
  views?: number;
  author?: { name?: string; url?: string };
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const kind = url.searchParams.get("kind");

  if (!query) {
    return Response.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 },
    );
  }

  try {
    const results = (await yts(query)) as { videos: YtSearchVideo[] };
    let videos = results.videos ?? [];

    if (kind === "shorts") {
      videos = videos.filter((v) => (v.duration?.seconds ?? 9999) <= 90);
    }

    const mapped = videos.map((v) => {
      const channelId = v.author?.url?.split("/").pop() ?? "";
      return {
        id: v.videoId,
        title: v.title,
        description: v.description,
        timestamp: v.timestamp,
        duration: v.duration?.seconds,
        age: v.ago,
        views: v.views,
        thumbnail: `/api/yt/thumbnail/${v.videoId}`,
        mediaUrl: `/api/yt/id/${v.videoId}`,
        author: {
          name: v.author?.name,
          url: v.author?.url,
          channelId,
          proxyUrl: `/api/yt/media/account/${channelId}`,
        },
      };
    });

    return Response.json({ query, results: mapped });
  } catch (error) {
    return Response.json(
      { error: "Search failed", details: (error as Error).message },
      { status: 500 },
    );
  }
}
