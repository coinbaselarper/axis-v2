"use client";

import {
  Music as MusicIcon,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { hoverLift, pressScale, usePopIn } from "../lib/anim";
import { type Track, useMusicPlayer } from "../lib/music";

type ApiTrack = {
  id: number;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  explicit?: boolean;
};

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function apiToTrack(t: ApiTrack): Track {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.artwork,
    duration: t.duration,
    explicit: t.explicit,
  };
}

export default function Music() {
  const {
    active, playing, progress, duration, pct, tracks,
    setTracks, playTrack, togglePlay, next, prev, seek,
  } = useMusicPlayer();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const rootRef = usePopIn<HTMLDivElement>([]);

  const activeIdx = active ? tracks.findIndex((t) => t.id === active.id) : -1;

  const fetchTracks = async (q: string) => {
    setLoading(true);
    try {
      const url = q
        ? `/api/music/search?q=${encodeURIComponent(q)}&limit=40`
        : `/api/music/search?q=${encodeURIComponent("top hits")}&limit=40`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { items?: ApiTrack[] };
      setTracks((json.items ?? []).map(apiToTrack));
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const term = query.trim();
    debounceRef.current = window.setTimeout(() => fetchTracks(term), term ? 320 : 0);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const items = Array.from(listRef.current.children);
    if (!items.length) return;
    gsap.fromTo(
      items,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.02, ease: "power2.out", overwrite: "auto", clearProps: "transform" },
    );
  }, [tracks]);

  useEffect(() => {
    if (!artRef.current) return;
    gsap.fromTo(
      artRef.current,
      { opacity: 0, scale: 0.94 },
      { opacity: 1, scale: 1, duration: 0.4, ease: "power2.out", clearProps: "transform" },
    );
  }, [active?.id]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  };

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full flex-col overflow-hidden text-zinc-100"
    >
      <div className="flex flex-1 gap-6 overflow-hidden p-6 pb-28">
        <div
          ref={artRef}
          className="relative aspect-square h-full shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] shadow-2xl"
        >
          {active?.artwork ? (
            <img src={active.artwork} alt={active.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <MusicIcon className="h-20 w-20 text-zinc-600" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-1.5 transition focus-within:border-white/20 focus-within:bg-white/[0.06]">
            <Search className="ml-2 h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, artists, albums..."
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm !text-white placeholder:text-zinc-500 outline-none"
            />
          </div>

          <div ref={listRef} className="axis-noscroll flex flex-1 flex-col gap-1 overflow-y-auto">
            {loading && tracks.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
            ) : null}
            {tracks.map((t, i) => {
              const isActive = i === activeIdx;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => playTrack(t)}
                  {...hoverLift(-1)}
                  {...pressScale(0.98)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                    isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/[0.04]">
                    {t.artwork ? (
                      <img src={t.artwork} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                      {isActive && playing ? (
                        <Pause className="h-4 w-4 text-white" />
                      ) : (
                        <Play className="h-4 w-4 text-white" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${isActive ? "text-white" : "text-zinc-100"}`}>
                      {t.title}
                      {t.explicit && (
                        <span className="ml-1.5 rounded bg-white/10 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
                          E
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{t.artist}</p>
                  </div>
                  <span className="shrink-0 text-xs text-zinc-500">{fmtTime(t.duration)}</span>
                </button>
              );
            })}
            {!loading && tracks.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-400">No results.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-4 bottom-4 z-30 flex items-center gap-4 rounded-xl border border-white/[0.06] px-4 py-2.5 backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--axis-bg) 60%, transparent)" }}
      >
        <div className="flex min-w-0 items-center gap-3" style={{ width: "20rem" }}>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white/[0.04]">
            {active?.artwork ? (
              <img src={active.artwork} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MusicIcon className="h-4 w-4 text-zinc-600" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-zinc-100">{active?.title ?? "N/A"}</p>
            <p className="truncate text-xs text-zinc-500">{active?.artist ?? ""}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={prev}
              disabled={activeIdx <= 0}
              {...pressScale(0.92)}
              aria-label="Previous"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-35"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!active}
              {...pressScale(0.9)}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200 disabled:opacity-35"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={activeIdx < 0 || activeIdx >= tracks.length - 1}
              {...pressScale(0.92)}
              aria-label="Next"
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-35"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          <div className="flex w-full items-center gap-2">
            <span className="text-[10px] tabular-nums text-zinc-500">{fmtTime(progress)}</span>
            <div
              onClick={handleSeek}
              className="group h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/[0.08]"
            >
              <div
                className="h-full bg-white transition-[width] duration-100"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-zinc-500">{fmtTime(duration)}</span>
          </div>
        </div>

        <div className="shrink-0" style={{ width: "20rem" }} />
      </div>

      <style jsx>{`
        .axis-noscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .axis-noscroll::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
