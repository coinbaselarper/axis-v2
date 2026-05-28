const MUSIC_BASES = (
  process.env.MUSIC_API_BASES ||
  "https://tidal-proxy.monochrome.tf,https://katze.qqdl.site,https://hund.qqdl.site,https://api.monochrome.tf,https://eu-central.monochrome.tf,https://hifi-api.kennyy.com.br,https://us-west.monochrome.tf,https://monochrome-api.samidy.com,https://trypt-hifi-dl-456461932686.us-west1.run.app"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MUSIC_TIMEOUT_MS = 8000;

const TIDAL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://listen.tidal.com",
  Referer: "https://listen.tidal.com/",
};

interface TidalArtist { id: number; name: string; picture?: string | null; type?: string }
interface TidalAlbum  { id: number; title: string; cover?: string | null }
interface TidalTrack  {
  id: number; title: string; duration: number; version?: string | null;
  explicit?: boolean; artist?: TidalArtist; artists?: TidalArtist[];
  album?: TidalAlbum;
}
interface TidalTrackManifest {
  data?: { manifest?: string; manifestMimeType?: string; audioQuality?: string };
}

export interface TidalSearchResp {
  data?: { items?: TidalTrack[]; totalNumberOfItems?: number };
}

export interface ClientTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  explicit?: boolean;
}

export function tidalCoverUrl(cover: string | null | undefined, size = 640): string {
  if (!cover) return "";
  return `https://resources.tidal.com/images/${cover.replace(/-/g, "/")}/${size}x${size}.jpg`;
}

export function toClientTrack(t: TidalTrack): ClientTrack {
  const artist =
    (t.artists?.length ? t.artists.map((a) => a.name).join(", ") : t.artist?.name) || "Unknown";
  return {
    id: t.id,
    title: t.title + (t.version ? ` (${t.version})` : ""),
    artist,
    album: t.album?.title ?? "",
    artwork: tidalCoverUrl(t.album?.cover),
    duration: t.duration,
    explicit: t.explicit,
  };
}

export async function callMusicApi<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const errors: string[] = [];
  for (const base of MUSIC_BASES) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), MUSIC_TIMEOUT_MS);
      const r = await fetch(url.toString(), { signal: ctrl.signal, headers: TIDAL_HEADERS });
      clearTimeout(t);
      if (!r.ok) { errors.push(`${base} ${r.status}`); continue; }
      return (await r.json()) as T;
    } catch (e) {
      errors.push(`${base} ${e instanceof Error ? e.message : "fail"}`);
    }
  }
  throw new Error(`All music upstreams failed: ${errors.join("; ")}`);
}

export async function resolveTidalStreamUrl(
  id: string,
  quality: string,
): Promise<{ url: string; codec?: string; mimeType?: string }> {
  const data = await callMusicApi<TidalTrackManifest>("/track/", { id, quality });
  const manifest = data?.data?.manifest;
  if (!manifest) throw new Error("No manifest in response");
  const decoded = JSON.parse(Buffer.from(manifest, "base64").toString("utf8")) as {
    urls?: string[];
    codecs?: string;
    mimeType?: string;
    encryptionType?: string;
  };
  const url = decoded.urls?.[0];
  if (!url) throw new Error("No stream URL in manifest");
  if (decoded.encryptionType && decoded.encryptionType !== "NONE")
    throw new Error(`Unsupported encryption: ${decoded.encryptionType}`);
  return { url, codec: decoded.codecs, mimeType: decoded.mimeType };
}
