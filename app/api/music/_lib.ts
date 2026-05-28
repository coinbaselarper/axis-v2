import fs from "fs";
import path from "path";
import { create as createYoutubeDl, youtubeDl as defaultYoutubeDl } from "youtube-dl-exec";
import {
  forceUpdateYtDlp,
  isOutdatedError,
  maybeUpdateYtDlp,
} from "../yt/updater";

const YT_DLP_BIN = (() => {
  const candidates = [
    process.env.YT_DLP_PATH,
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
})();

const youtubeDl = YT_DLP_BIN ? createYoutubeDl(YT_DLP_BIN) : defaultYoutubeDl;

export type AudioMeta = {
  url: string;
  ext: string;
  mimeType: string;
  http_headers: Record<string, string>;
};

type CacheEntry = AudioMeta & { expiresAt: number };

const AUDIO_URL_CACHE = new Map<string, CacheEntry>();
const AUDIO_URL_TTL_MS = 5 * 60 * 60 * 1000;
const AUDIO_URL_MAX = 256;

function cacheGet(videoId: string): CacheEntry | null {
  const entry = AUDIO_URL_CACHE.get(videoId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    AUDIO_URL_CACHE.delete(videoId);
    return null;
  }
  return entry;
}

function cacheSet(videoId: string, value: AudioMeta) {
  if (AUDIO_URL_CACHE.size >= AUDIO_URL_MAX) {
    const first = AUDIO_URL_CACHE.keys().next().value;
    if (first) AUDIO_URL_CACHE.delete(first);
  }
  AUDIO_URL_CACHE.set(videoId, { ...value, expiresAt: Date.now() + AUDIO_URL_TTL_MS });
}

export function cacheDelete(videoId: string) {
  AUDIO_URL_CACHE.delete(videoId);
}

const inflight = new Map<string, Promise<AudioMeta>>();

export type ClassifiedError = { status: number; message: string; skip: boolean };

export function classifyYtdlError(error: unknown): ClassifiedError {
  const e = error as { message?: string; stderr?: string } | undefined;
  const msg = (e?.message ?? e?.stderr ?? "").toLowerCase();
  if (msg.includes("sign in") || msg.includes("login required") || msg.includes("age"))
    return { status: 403, message: "Video is age-restricted or requires sign-in", skip: true };
  if (msg.includes("private") || msg.includes("unavailable"))
    return { status: 404, message: "Video is private or unavailable", skip: true };
  if (msg.includes("not playable"))
    return { status: 403, message: "Video is not playable", skip: true };
  if (msg.includes("region") || msg.includes("country"))
    return { status: 451, message: "Video not available in your region", skip: true };
  if (msg.includes("premium") || msg.includes("membership"))
    return { status: 402, message: "Video requires premium membership", skip: true };
  if (msg.includes("copyright") || msg.includes("blocked"))
    return { status: 451, message: "Video blocked due to copyright", skip: true };
  if (msg.includes("too many requests") || msg.includes("rate limit"))
    return { status: 429, message: "Rate limited by YouTube, try again later", skip: false };
  if (msg.includes("network") || msg.includes("timeout"))
    return { status: 503, message: "Network error, please try again", skip: false };
  return { status: 500, message: "Failed to resolve audio", skip: false };
}

export const fetchWithTimeout = (
  url: string,
  options: RequestInit = {},
  timeout = 10_000,
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

export const formatDeezerPath = (pathString: string): string | null => {
  const match = pathString.match(/^([a-z]+?)(\d+)?([A-Z][a-zA-Z]*)?$/);
  if (!match) return null;
  const [, resource, id, subResource] = match;
  if (!resource) return null;
  return [resource, id, subResource?.toLowerCase()].filter(Boolean).join("/");
};

const COOKIES_BROWSER = process.env.YDL_COOKIES_BROWSER ?? null;
const COOKIES_FILE = process.env.YDL_COOKIES_FILE ?? null;

type YtFormat = {
  url?: string;
  ext?: string;
  acodec?: string;
  vcodec?: string;
  abr?: number;
  http_headers?: Record<string, string>;
};

type YtInfo = { formats?: YtFormat[] };

export async function resolveAudioUrl(videoId: string): Promise<AudioMeta> {
  const cached = cacheGet(videoId);
  if (cached) return cached;

  const existing = inflight.get(videoId);
  if (existing) return existing;

  void maybeUpdateYtDlp();

  const promise = (async (): Promise<AudioMeta> => {
    const ytdlOptions: Record<string, unknown> = {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
    };
    if (COOKIES_FILE) ytdlOptions.cookies = path.resolve(COOKIES_FILE);
    else if (COOKIES_BROWSER) ytdlOptions.cookiesFromBrowser = COOKIES_BROWSER;

    let info: YtInfo;
    try {
      info = (await youtubeDl(
        `https://www.youtube.com/watch?v=${videoId}`,
        ytdlOptions,
      )) as unknown as YtInfo;
    } catch (err) {
      if (isOutdatedError(err)) {
        console.warn("[yt-dlp] outdated error detected (music), forcing update and retrying");
        await forceUpdateYtDlp();
        info = (await youtubeDl(
          `https://www.youtube.com/watch?v=${videoId}`,
          ytdlOptions,
        )) as unknown as YtInfo;
      } else {
        throw err;
      }
    }

    const audioOnly = info.formats
      ?.filter((f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none"))
      .sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));

    const audioFormat =
      audioOnly?.[0] ?? info.formats?.find((f) => f.acodec && f.acodec !== "none");

    if (!audioFormat?.url) throw new Error("No audio format URL found for this video");

    const ext = audioFormat.ext ?? "webm";
    const mimeType = ext === "m4a" || ext === "mp4" ? "audio/mp4" : "audio/webm";
    const http_headers = audioFormat.http_headers ?? {};
    const result: AudioMeta = { url: audioFormat.url, ext, mimeType, http_headers };
    cacheSet(videoId, result);
    return result;
  })();

  promise.catch(() => {});
  inflight.set(videoId, promise);
  promise.finally(() => inflight.delete(videoId));
  return promise;
}

let unhandledRejectionWired = false;
export function wireUnhandledRejection() {
  if (unhandledRejectionWired) return;
  unhandledRejectionWired = true;
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection] caught stray rejection (server kept alive):", reason);
  });
}
wireUnhandledRejection();
