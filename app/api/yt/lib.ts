import fs from "fs";
import path from "path";
import {
  create as createYoutubeDl,
  youtubeDl as defaultYoutubeDl,
} from "youtube-dl-exec";
import {
  forceUpdateYtDlp,
  isOutdatedError,
  maybeUpdateYtDlp,
} from "./updater";

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

export const youtubeDl = YT_DLP_BIN
  ? createYoutubeDl(YT_DLP_BIN)
  : defaultYoutubeDl;

export type VideoMeta = {
  url: string;
  ext: string;
  mimeType: string;
  http_headers: Record<string, string>;
};

type CacheEntry = VideoMeta & { expiresAt: number };

const VIDEO_URL_CACHE = new Map<string, CacheEntry>();
const VIDEO_URL_TTL_MS = 60 * 60 * 1000;
const VIDEO_URL_MAX = 128;

function cacheGet(videoId: string): CacheEntry | null {
  const entry = VIDEO_URL_CACHE.get(videoId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    VIDEO_URL_CACHE.delete(videoId);
    return null;
  }
  return entry;
}

function cacheSet(videoId: string, value: VideoMeta) {
  if (VIDEO_URL_CACHE.size >= VIDEO_URL_MAX) {
    const first = VIDEO_URL_CACHE.keys().next().value;
    if (first) VIDEO_URL_CACHE.delete(first);
  }
  VIDEO_URL_CACHE.set(videoId, {
    ...value,
    expiresAt: Date.now() + VIDEO_URL_TTL_MS,
  });
}

export function videoCacheDelete(videoId: string) {
  VIDEO_URL_CACHE.delete(videoId);
}

const inflight = new Map<string, Promise<VideoMeta>>();

export const fetchWithTimeout = (
  url: string,
  options: RequestInit = {},
  timeout = 15_000,
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(id),
  );
};

const COOKIES_BROWSER = process.env.YDL_COOKIES_BROWSER ?? null;
const COOKIES_FILE = process.env.YDL_COOKIES_FILE ?? null;

type YtFormat = {
  url?: string;
  ext?: string;
  acodec?: string;
  vcodec?: string;
  height?: number;
  tbr?: number;
  protocol?: string;
  http_headers?: Record<string, string>;
};

type YtInfo = { formats?: YtFormat[] };

export async function resolveVideoUrl(videoId: string): Promise<VideoMeta> {
  const cached = cacheGet(videoId);
  if (cached) return cached;

  const existing = inflight.get(videoId);
  if (existing) return existing;

  void maybeUpdateYtDlp();

  const promise = (async (): Promise<VideoMeta> => {
    const ytdlOptions: Record<string, unknown> = {
      dumpSingleJson: true,
      noWarnings: true,
      format: "best[ext=mp4]/best",
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
        console.warn("[yt-dlp] outdated error detected, forcing update and retrying");
        await forceUpdateYtDlp();
        info = (await youtubeDl(
          `https://www.youtube.com/watch?v=${videoId}`,
          ytdlOptions,
        )) as unknown as YtInfo;
      } else {
        throw err;
      }
    }

    const combined = info.formats
      ?.filter(
        (f) =>
          f.url &&
          f.acodec &&
          f.acodec !== "none" &&
          f.vcodec &&
          f.vcodec !== "none" &&
          (f.protocol === "https" || f.protocol === "http"),
      )
      .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0));

    const format =
      combined?.find((f) => f.ext === "mp4") ??
      combined?.[0] ??
      info.formats?.find((f) => f.url && f.vcodec && f.vcodec !== "none");

    if (!format?.url) throw new Error("No playable video format found");

    const ext = format.ext ?? "mp4";
    const mimeType = ext === "webm" ? "video/webm" : "video/mp4";
    const http_headers = format.http_headers ?? {};
    const result: VideoMeta = { url: format.url, ext, mimeType, http_headers };
    cacheSet(videoId, result);
    return result;
  })();

  promise.catch(() => {});
  inflight.set(videoId, promise);
  promise.finally(() => inflight.delete(videoId));
  return promise;
}

export type ClassifiedError = {
  status: number;
  message: string;
  skip: boolean;
};

export function classifyYtdlError(error: unknown): ClassifiedError {
  const e = error as { message?: string; stderr?: string } | undefined;
  const msg = (e?.message ?? e?.stderr ?? "").toLowerCase();
  if (
    msg.includes("sign in") ||
    msg.includes("login required") ||
    msg.includes("age")
  )
    return {
      status: 403,
      message: "Video is age-restricted or requires sign-in",
      skip: true,
    };
  if (msg.includes("private") || msg.includes("unavailable"))
    return {
      status: 404,
      message: "Video is private or unavailable",
      skip: true,
    };
  if (msg.includes("not playable"))
    return { status: 403, message: "Video is not playable", skip: true };
  if (msg.includes("region") || msg.includes("country"))
    return {
      status: 451,
      message: "Video not available in your region",
      skip: true,
    };
  if (msg.includes("too many requests") || msg.includes("rate limit"))
    return {
      status: 429,
      message: "Rate limited by YouTube, try again later",
      skip: false,
    };
  if (msg.includes("network") || msg.includes("timeout"))
    return { status: 503, message: "Network error, please try again", skip: false };
  return { status: 500, message: "Failed to resolve video", skip: false };
}
