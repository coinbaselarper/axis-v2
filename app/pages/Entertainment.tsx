"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Cloud,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { hoverLift, pressScale, usePopIn } from "../lib/anim";
import { useSettings } from "../lib/settings";

type AxisScramjet = { encodeUrl: (url: string) => string };
const MOVIES_UPSTREAM = "https://movies.goadeddev.dpdns.org";

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_KEY ?? "";
const TMDB = process.env.NEXT_PUBLIC_TMDB_API ?? "https://api.themoviedb.org/3";
const POSTER_BASE =
  process.env.NEXT_PUBLIC_TMDB_POSTER_BASE ?? "https://image.tmdb.org/t/p/w500";

const NSFW_TERMS = [
  "porn",
  "porno",
  "xxx",
  "nsfw",
  "erotic",
  "erotica",
  "sex",
  "sexy",
  "sexual",
  "nude",
  "nudity",
  "naked",
  "fetish",
  "bdsm",
  "hardcore",
  "softcore",
  "milf",
  "hentai",
  "incest",
  "orgasm",
  "orgy",
  "lust",
  "kink",
  "kinky",
  "horny",
  "anal",
  "fuck",
  "fucking",
  "boobs",
  "tits",
  "breasts",
  "stripper",
  "escort",
  "swinger",
  "swingers",
];

function containsNsfw(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return NSFW_TERMS.some((term) =>
    new RegExp(`\\b${term}\\b`, "i").test(lower),
  );
}

type Tab = "movies" | "shows" | "yt-videos";

type TmdbItem = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  adult?: boolean;
};

type YtItem = {
  id: string;
  title?: string;
  description?: string;
  duration?: number;
  age?: string;
  views?: number;
  thumbnail: string;
  mediaUrl: string;
  author?: { name?: string };
};

const TAB_LABELS: Record<Tab, string> = {
  movies: "Movies",
  shows: "Shows",
  "yt-videos": "YT Videos",
};

const isYtTab = (t: Tab) => t === "yt-videos";

export default function Movies() {
  const [tab, setTab] = useState<Tab>("movies");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<TmdbItem[]>([]);
  const [ytItems, setYtItems] = useState<YtItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [active, setActive] = useState<TmdbItem | null>(null);
  const [activeYt, setActiveYt] = useState<{ index: number } | null>(null);

  const debounceRef = useRef<number | null>(null);
  const rootRef = usePopIn<HTMLDivElement>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const tabMenuRef = useRef<HTMLDivElement | null>(null);
  const tabTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [tabOpen, setTabOpen] = useState(false);

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    if (!tabOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tabMenuRef.current?.contains(t) || tabTriggerRef.current?.contains(t))
        return;
      setTabOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTabOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [tabOpen]);

  useEffect(() => {
    if (tabOpen && tabMenuRef.current) {
      gsap.fromTo(
        tabMenuRef.current,
        { opacity: 0, y: -6, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.16,
          ease: "power2.out",
          transformOrigin: "top right",
        },
      );
    }
  }, [tabOpen]);

  const fetchContent = async (
    targetTab: Tab,
    targetPage: number,
    query: string,
  ) => {
    setLoading(true);
    setError("");
    try {
      const trimmed = query.trim();
      if (trimmed && containsNsfw(trimmed)) {
        setItems([]);
        setYtItems([]);
        return;
      }

      if (isYtTab(targetTab)) {
        const q = trimmed || "trending";
        const res = await fetch(
          `/api/yt/search?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results = (data.results ?? []) as YtItem[];
        setYtItems(
          results.filter(
            (r) =>
              !containsNsfw(r.title) && !containsNsfw(r.description),
          ),
        );
        setItems([]);
        return;
      }

      const endpoint = trimmed
        ? targetTab === "movies"
          ? "search/movie"
          : "search/tv"
        : targetTab === "movies"
          ? "movie/popular"
          : "tv/popular";
      const params = new URLSearchParams({
        api_key: TMDB_KEY,
        page: String(targetPage),
        include_adult: "false",
      });
      if (trimmed) params.set("query", trimmed);
      const res = await fetch(`${TMDB}/${endpoint}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results = (data.results ?? []) as TmdbItem[];
      setItems(
        results.filter(
          (r) =>
            !r.adult &&
            !containsNsfw(r.title) &&
            !containsNsfw(r.name) &&
            !containsNsfw(r.overview),
        ),
      );
      setYtItems([]);
    } catch (err) {
      setError((err as Error).message || "Failed to load");
      setItems([]);
      setYtItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContent(tab, page, search);

  }, [tab, page]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPage(1);
      fetchContent(tab, 1, search);
    }, 320);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };

  }, [search]);

  useEffect(() => {
    if (!gridRef.current) return;
    const cards = Array.from(gridRef.current.children);
    if (cards.length === 0) return;
    gsap.fromTo(
      cards,
      { opacity: 0, y: 14, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.32,
        stagger: 0.025,
        ease: "power2.out",
        overwrite: "auto",
        clearProps: "transform",
      },
    );
  }, [items, ytItems]);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setSearch("");
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const changePage = (next: number) => {
    if (next < 1) return;
    setPage(next);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full flex-col overflow-hidden text-zinc-100"
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pt-8 pb-12">
        <div className="mx-auto mt-8 w-full max-w-2xl">
          <div className="flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-1.5 transition focus-within:border-white/20 focus-within:bg-white/[0.06]">
            <Search className="ml-2 h-4 w-4 shrink-0 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Watch over 1,000 educational videos."
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm !text-white placeholder:text-zinc-500 outline-none"
            />
            <div className="relative shrink-0">
              <button
                ref={tabTriggerRef}
                type="button"
                onClick={() => setTabOpen((v) => !v)}
                {...pressScale(0.95)}
                className="flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-black/35"
              >
                <span>{TAB_LABELS[tab]}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${
                    tabOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {tabOpen ? (
                <div
                  ref={tabMenuRef}
                  className="absolute right-0 top-full z-30 mt-2 w-40 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a]/95 p-1 shadow-xl backdrop-blur"
                >
                  {(["movies", "shows", "yt-videos"] as Tab[]).map((opt, i) => {
                    const selected = tab === opt;
                    return (
                      <div key={opt}>
                        {i > 0 ? (
                          <div className="my-1 h-px bg-white/[0.06]" />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            switchTab(opt);
                            setTabOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                            selected
                              ? "bg-white/[0.10] text-white"
                              : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                          }`}
                        >
                          <span>{TAB_LABELS[opt]}</span>
                          {selected ? (
                            <Check className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl">
          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
              {error} - TMDB may be blocked. Try the Browser tab to load it
              through the proxy.
            </div>
          ) : null}

          {isYtTab(tab) ? (
            <div
              ref={gridRef}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
            >
              {ytItems.map((item, index) => (
                <YtCard
                  key={`${tab}-${item.id}`}
                  item={item}
                  variant="video"
                  onOpen={() => setActiveYt({ index })}
                />
              ))}
            </div>
          ) : (
            <div
              ref={gridRef}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            >
              {items.map((item) =>
                item.poster_path ? (
                  <PosterCard
                    key={`${tab}-${item.id}`}
                    item={item}
                    onOpen={() => setActive(item)}
                  />
                ) : null,
              )}
            </div>
          )}

          {!loading &&
          ((isYtTab(tab) && ytItems.length === 0) ||
            (!isYtTab(tab) && items.length === 0)) &&
          !error ? (
            <p className="py-10 text-center text-sm text-zinc-400">
              Nothing to show.
            </p>
          ) : null}

          {!isYtTab(tab) ? (
            <div className="mt-8 flex items-center justify-center gap-3">
              <PageBtn
                disabled={page <= 1 || loading}
                onClick={() => changePage(page - 1)}
                aria-label="Previous"
              >
                <ArrowLeft className="h-4 w-4" />
              </PageBtn>
              <span className="text-sm text-zinc-400">Page {page}</span>
              <PageBtn
                disabled={loading}
                onClick={() => changePage(page + 1)}
                aria-label="Next"
              >
                <ArrowRight className="h-4 w-4" />
              </PageBtn>
            </div>
          ) : null}
        </div>
      </div>

      {active ? (
        <Player
          type={tab === "movies" ? "movie" : "tv"}
          id={active.id}
          onClose={() => setActive(null)}
        />
      ) : null}

      {activeYt ? (
        <YtPlayer
          items={ytItems}
          startIndex={activeYt.index}
          mode="videos"
          onClose={() => setActiveYt(null)}
        />
      ) : null}
    </div>
  );
}

function PageBtn({
  children,
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...hoverLift(-1)}
      {...pressScale(0.92)}
      {...rest}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.04] text-zinc-100 transition-colors hover:border-white/15 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function YtCard({
  item,
  variant,
  onOpen,
}: {
  item: YtItem;
  variant: "video" | "short";
  onOpen: () => void;
}) {
  const aspect = variant === "short" ? "aspect-[2/3]" : "aspect-video";
  return (
    <button
      type="button"
      onClick={onOpen}
      {...hoverLift(-3)}
      {...pressScale(0.97)}
      className={`group relative flex ${aspect} flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] text-left transition-colors hover:border-white/15`}
    >
      <img
        src={item.thumbnail}
        alt={item.title ?? ""}
        loading="lazy"
        className="h-full w-full object-cover"
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <h3 className="truncate text-[13px] font-semibold text-white">
          {item.title}
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-zinc-300">
          {item.author?.name ? (
            <span className="truncate">{item.author.name}</span>
          ) : null}
          {typeof item.views === "number" ? (
            <span>{formatViews(item.views)}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B views`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} views`;
}

function YtPlayer({
  items,
  startIndex,
  mode,
  onClose,
}: {
  items: YtItem[];
  startIndex: number;
  mode: "videos" | "shorts";
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [index, setIndex] = useState(startIndex);
  const current = items[index];

  useEffect(() => {
    if (!wrapRef.current) return;
    gsap.fromTo(
      wrapRef.current,
      { opacity: 0, scale: 0.98 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.25,
        ease: "power2.out",
        clearProps: "transform",
      },
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (index < items.length - 1) setIndex(index + 1);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (index > 0) setIndex(index - 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, index, items.length]);

  const playNext = () => {
    if (index < items.length - 1) setIndex(index + 1);
    else onClose();
  };

  if (!current) return null;

  return (
    <div ref={wrapRef} className="absolute inset-0 z-50 bg-black">
      <div className="absolute inset-0 flex items-center justify-center">
        <video
          ref={videoRef}
          key={current.id}
          src={current.mediaUrl}
          autoPlay
          controls
          playsInline
          onEnded={mode === "shorts" ? playNext : undefined}
          className={
            mode === "shorts"
              ? "h-full max-h-full w-auto max-w-full object-contain"
              : "h-full w-full object-contain"
          }
        />
      </div>

      <button
        type="button"
        onClick={onClose}
        aria-label="Back"
        {...hoverLift(-1)}
        {...pressScale(0.9)}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 max-w-[60%] truncate rounded-full bg-black/55 px-4 py-1.5 text-xs text-white backdrop-blur">
        {current.title}
      </div>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => index > 0 && setIndex(index - 1)}
          disabled={index <= 0}
          aria-label="Previous"
          {...pressScale(0.9)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-40"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={playNext}
          disabled={index >= items.length - 1}
          aria-label="Next"
          {...pressScale(0.9)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/80 disabled:opacity-40"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function PosterCard({
  item,
  onOpen,
}: {
  item: TmdbItem;
  onOpen: () => void;
}) {
  const title = item.title ?? item.name ?? "";
  const date = item.release_date ?? item.first_air_date ?? "";
  const year = date ? date.slice(0, 4) : "";
  const rating =
    typeof item.vote_average === "number"
      ? item.vote_average.toFixed(1)
      : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      {...hoverLift(-3)}
      {...pressScale(0.97)}
      className="group relative flex aspect-[2/3] flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] text-left transition-colors hover:border-white/15"
    >
      <img
        src={`${POSTER_BASE}${item.poster_path}`}
        alt={title}
        loading="lazy"
        className="h-full w-full object-cover"
      />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <h3 className="truncate text-[13px] font-semibold text-white">
          {title}
        </h3>
        <div className="flex items-center gap-2 text-[11px] text-zinc-300">
          {year ? <span>{year}</span> : null}
          {rating ? <span>★ {rating}</span> : null}
        </div>
      </div>
    </button>
  );
}


type NovaSource = {
  id: string;
  name: string;
  movie: string;
  tv: string;
};

const NOVA_SOURCES: NovaSource[] = [
  { id: "videasy", name: "VidEasy (4K)", movie: "https://player.videasy.net/movie/{id}?color=8834ec", tv: "https://player.videasy.net/tv/{id}/{season}/{episode}?color=8834ec" },
  { id: "vidfast", name: "VidFast (4K)", movie: "https://vidfast.pro/movie/{id}", tv: "https://vidfast.pro/tv/{id}/{season}/{episode}" },
  { id: "vidlink", name: "VidLink", movie: "https://vidlink.pro/movie/{id}", tv: "https://vidlink.pro/tv/{id}/{season}/{episode}" },
  { id: "embedsu", name: "EmbedSU", movie: "https://embed.su/embed/movie/{id}", tv: "https://embed.su/embed/tv/{id}/{season}/{episode}" },
  { id: "pstream", name: "P-Stream", movie: "https://iframe.pstream.mov/media/tmdb-movie-{id}", tv: "https://iframe.pstream.mov/media/tmdb-tv-{id}/{season}/{episode}" },
  { id: "mapple", name: "MappleTv", movie: "https://mappletv.uk/watch/movie/{id}", tv: "https://mappletv.uk/watch/tv/{id}-{season}-{episode}" },
  { id: "hexa", name: "Hexa", movie: "https://hexa.watch/watch/movie/{id}", tv: "https://hexa.watch/watch/tv/{id}/{season}/{episode}" },
  { id: "111movies", name: "111Movies", movie: "https://111movies.com/movie/{id}", tv: "https://111movies.com/tv/{id}/{season}/{episode}" },
  { id: "vidsrcsu", name: "VidSrcSU", movie: "https://vidsrc.su/embed/movie/{id}", tv: "https://vidsrc.su/embed/tv/{id}/{season}/{episode}" },
  { id: "vidsrcvip", name: "VidSrcVIP", movie: "https://vidsrc.vip/embed/movie/{id}", tv: "https://vidsrc.vip/embed/tv/{id}/{season}/{episode}" },
  { id: "vidsrcxyz", name: "VidSrcXyz", movie: "https://vidsrc.xyz/embed/movie/{id}", tv: "https://vidsrc.xyz/embed/tv/{id}/{season}/{episode}" },
  { id: "vidsrcrip", name: "VidSrcRIP", movie: "https://vidsrc.rip/embed/movie/{id}", tv: "https://vidsrc.rip/embed/tv/{id}/{season}/{episode}" },
  { id: "vidsrccc", name: "VidSrcCC", movie: "https://vidsrc.cc/v2/embed/movie/{id}?autoPlay=false", tv: "https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}?autoPlay=false" },
  { id: "vidsrccx", name: "VidSrcCX", movie: "https://vidsrc.cx/embed/movie/{id}", tv: "https://vidsrc.cx/embed/tv/{id}/{season}/{episode}" },
  { id: "moviesapi", name: "MoviesAPI", movie: "https://moviesapi.club/movie/{id}", tv: "https://moviesapi.club/tv/{id}-{season}-{episode}" },
  { id: "multiembed", name: "MultiEmbed", movie: "https://multiembed.mov/?video_id={id}&tmdb=1", tv: "https://multiembed.mov/?video_id={id}&tmdb=1&s={season}&e={episode}" },
  { id: "2embed", name: "2Embed", movie: "https://www.2embed.cc/embed/{id}", tv: "https://www.2embed.cc/embedtv/{id}&s={season}&e={episode}" },
  { id: "123embed", name: "123Embed", movie: "https://play2.123embed.net/movie/{id}", tv: "https://play2.123embed.net/tv/{id}/{season}/{episode}" },
  { id: "smashystream", name: "SmashyStream", movie: "https://player.smashy.stream/movie/{id}", tv: "https://player.smashy.stream/tv/{id}?s={season}&e={episode}" },
  { id: "autoembed", name: "AutoEmbed", movie: "https://player.autoembed.cc/embed/movie/{id}", tv: "https://player.autoembed.cc/embed/tv/{id}/{season}/{episode}" },
  { id: "vidify", name: "Vidify", movie: "https://vidify.top/embed/movie/{id}", tv: "https://vidify.top/embed/tv/{id}/{season}/{episode}" },
  { id: "flicky", name: "Flicky", movie: "https://flicky.host/embed/movie/?id={id}", tv: "https://flicky.host/embed/tv/{id}/{season}/{episode}" },
  { id: "rive", name: "RiveStream", movie: "https://rivestream.org/embed?type=movie&id={id}", tv: "https://rivestream.org/embed?type=tv&id={id}&season={season}&episode={episode}" },
  { id: "vidora", name: "Vidora", movie: "https://vidora.su/movie/{id}", tv: "https://vidora.su/tv/{id}/{season}/{episode}" },
  { id: "nebula", name: "NebulaFlix", movie: "https://nebulaflix.stream/movie?mt={id}&server=1", tv: "https://nebulaflix.stream/show?st={id}&season={season}&episode={episode}&server=1" },
  { id: "vidjoy", name: "VidJoy", movie: "https://vidjoy.pro/embed/movie/{id}", tv: "https://vidjoy.pro/embed/tv/{id}/{season}/{episode}" },
  { id: "vidzee", name: "VidZee", movie: "https://player.vidzee.wtf/embed/movie/{id}", tv: "https://player.vidzee.wtf/embed/tv/{id}/{season}/{episode}" },
  { id: "spenflix", name: "Spenflix", movie: "https://spencerdevs.xyz/movie/{id}", tv: "https://spencerdevs.xyz/tv/{id}/{season}/{episode}" },
];

const SOURCE_KEY = "axis.movies.source.v1";

function buildEmbedUrl(
  src: NovaSource,
  type: "movie" | "tv",
  id: number,
  season: number,
  episode: number,
) {
  const tpl = type === "movie" ? src.movie : src.tv;
  return tpl
    .replaceAll("{id}", String(id))
    .replaceAll("{season}", String(season))
    .replaceAll("{episode}", String(episode));
}

function Player({
  type,
  id,
  onClose,
}: {
  type: "movie" | "tv";
  id: number;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement | null>(null);

  const [sourceId, setSourceId] = useState<string>(() => {
    if (typeof window === "undefined") return NOVA_SOURCES[0].id;
    try {
      const saved = window.localStorage.getItem(SOURCE_KEY);
      if (saved && NOVA_SOURCES.some((s) => s.id === saved)) return saved;
    } catch {}
    return NOVA_SOURCES[0].id;
  });
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [sourceOpen, setSourceOpen] = useState(false);

  const source =
    NOVA_SOURCES.find((s) => s.id === sourceId) ?? NOVA_SOURCES[0];
  const embedUrl = buildEmbedUrl(source, type, id, season, episode);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOURCE_KEY, sourceId);
    } catch {}
  }, [sourceId]);

  useEffect(() => {
    if (!wrapRef.current) return;
    gsap.fromTo(
      wrapRef.current,
      { opacity: 0, scale: 0.98 },
      {
        opacity: 1,
        scale: 1,
        duration: 0.25,
        ease: "power2.out",
        clearProps: "transform",
      },
    );
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!sourceOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        sourceMenuRef.current?.contains(t) ||
        sourceTriggerRef.current?.contains(t)
      )
        return;
      setSourceOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [sourceOpen]);

  useEffect(() => {
    if (sourceOpen && sourceMenuRef.current) {
      gsap.fromTo(
        sourceMenuRef.current,
        { opacity: 0, y: -6, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.16,
          ease: "power2.out",
          transformOrigin: "top right",
        },
      );
    }
  }, [sourceOpen]);

  return (
    <div ref={wrapRef} className="absolute inset-0 z-50 bg-black">
      <iframe
        key={embedUrl}
        src={embedUrl}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full border-0 bg-black"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Back"
        {...hoverLift(-1)}
        {...pressScale(0.9)}
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {type === "tv" ? (
          <div className="flex items-center gap-2 rounded-full bg-black/55 px-2 py-1 text-xs text-white backdrop-blur">
            <span className="text-zinc-400">S</span>
            <input
              type="number"
              min={1}
              value={season}
              onChange={(e) =>
                setSeason(Math.max(1, parseInt(e.target.value || "1", 10)))
              }
              className="w-10 bg-transparent text-center outline-none"
            />
            <span className="text-zinc-400">E</span>
            <input
              type="number"
              min={1}
              value={episode}
              onChange={(e) =>
                setEpisode(Math.max(1, parseInt(e.target.value || "1", 10)))
              }
              className="w-10 bg-transparent text-center outline-none"
            />
          </div>
        ) : null}
        <div className="relative">
          <button
            ref={sourceTriggerRef}
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            {...pressScale(0.9)}
            aria-label={`Source: ${source.name}`}
            title={source.name}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/80"
          >
            <Cloud className="h-5 w-5" />
          </button>
          {sourceOpen ? (
            <div
              ref={sourceMenuRef}
              className="absolute right-0 top-full z-30 mt-2 max-h-[60vh] w-48 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#0a0a0a]/95 p-1 shadow-xl backdrop-blur"
            >
              {NOVA_SOURCES.map((s, i) => {
                const selected = s.id === sourceId;
                return (
                  <div key={s.id}>
                    {i > 0 ? (
                      <div className="my-1 h-px bg-white/[0.06]" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setSourceId(s.id);
                        setSourceOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "bg-white/[0.10] text-white"
                          : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span>{s.name}</span>
                      {selected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
