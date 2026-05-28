export const dynamic = "force-dynamic";

type LrclibResult = {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean;
};

type RichsyncWord = { c?: string; o?: number };
type RichsyncLine = { ts?: number; l?: RichsyncWord[] };

function richsyncToEnhancedLRC(rawJson: string): string | null {
  let data: RichsyncLine[];
  try {
    data = JSON.parse(rawJson) as RichsyncLine[];
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toFixed(2).padStart(5, "0");
    return `${m}:${s}`;
  };

  return data
    .map((line) => {
      const ts = line.ts ?? 0;
      const tags = (line.l ?? [])
        .filter((w) => w.c && w.c.trim().length > 0)
        .map((w) => `<${fmt(ts + (w.o ?? 0))}>${w.c}`)
        .join(" ");
      return `[${fmt(ts)}] ${tags}`;
    })
    .join("\n");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = url.searchParams.get("a");
  const s = url.searchParams.get("s");
  if (!a || !s) {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  const MXM_KEY = process.env.MUSIXMATCH_KEY ?? "";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const fetchJSON = async <T>(target: string): Promise<T> => {
    const r = await fetch(target, {
      signal: controller.signal,
      headers: { "User-Agent": "MXMusicPlayer/1.1", Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  };

  try {
    if (MXM_KEY) {
      try {
        type MxmSearch = {
          message?: { body?: { track_list?: Array<{ track?: { track_id?: number } }> } };
        };
        const searchData = await fetchJSON<MxmSearch>(
          `https://api.musixmatch.com/ws/1.1/track.search` +
            `?q_track=${encodeURIComponent(s)}&q_artist=${encodeURIComponent(a)}` +
            `&f_has_lyrics=1&s_track_rating=desc&page_size=1&apikey=${MXM_KEY}`,
        );

        const trackId = searchData?.message?.body?.track_list?.[0]?.track?.track_id;
        if (trackId) {
          type MxmRich = { message?: { body?: { richsync?: { richsync_body?: string } } } };
          const richData = await fetchJSON<MxmRich>(
            `https://api.musixmatch.com/ws/1.1/track.richsync.get` +
              `?track_id=${trackId}&apikey=${MXM_KEY}`,
          );

          const rawBody = richData?.message?.body?.richsync?.richsync_body;
          if (rawBody) {
            const enhanced = richsyncToEnhancedLRC(rawBody);
            if (enhanced) {
              clearTimeout(timeoutId);
              return Response.json({
                synced: enhanced,
                plain: null,
                instrumental: false,
                source: "musixmatch",
              });
            }
          }
        }
      } catch (mxmErr) {
        console.warn(`[Musixmatch] ${s}: ${(mxmErr as Error).message}`);
      }
    }

    const results = await fetchJSON<LrclibResult[]>(
      `https://lrclib.net/api/search` +
        `?track_name=${encodeURIComponent(s)}&artist_name=${encodeURIComponent(a)}`,
    );

    clearTimeout(timeoutId);

    if (!results.length) {
      return Response.json({ error: "No lyrics" }, { status: 404 });
    }

    const match = results.find((r) => r.syncedLyrics) ?? results[0];
    return Response.json({
      synced: match.syncedLyrics ?? null,
      plain: match.plainLyrics ?? null,
      instrumental: match.instrumental ?? false,
      source: "lrclib",
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`[Lyric Sync Error] ${s}:`, (err as Error).message);
    return Response.json(
      {
        error: "Network Timeout",
        plain: "Could not connect to lyric server. Please try again later.",
      },
      { status: 500 },
    );
  }
}
