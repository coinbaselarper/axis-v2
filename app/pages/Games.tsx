"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import gsap from "gsap";
import { hoverLift, pressScale, usePopIn } from "../lib/anim";
import { useSettings } from "../lib/settings";

type AxisScramjet = { encodeUrl: (url: string) => string };

const LUMIN_SRC = "https://cdn.jsdelivr.net/gh/luminsdk/script@latest/lumin.min.js";
const ITEMS_PER_PAGE = 30;

type LuminGame = {
  id: string;
  name: string;
  image_token: string;
  category?: string;
};

type LuminPage = {
  games: LuminGame[];
  total: number;
  page: number;
  pages: number;
};

declare global {
  interface Window {
    Lumin?: {
      init: (cfg: Record<string, unknown>) => Promise<void>;
      destroy: () => void;
      getGames: (opts: { page: number; limit: number; q?: string }) => Promise<LuminPage>;
      getImageUrl: (token: string) => Promise<string>;
      getGameUrl: (id: string) => Promise<{ url: string; meta: Record<string, unknown> }>;
    };
  }
}

function isBridgeDestroyed(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /worker bridge destroyed/i.test(msg);
}

function loadLumin(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Lumin) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-lumin="true"]`,
    );
    if (existing) {
      if (window.Lumin) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("LuminSDK failed to load")),
      );
      return;
    }
    const el = document.createElement("script");
    el.src = LUMIN_SRC;
    el.async = true;
    el.dataset.lumin = "true";
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () =>
      reject(new Error("LuminSDK failed to load")),
    );
    document.head.appendChild(el);
  });
}

export default function Games() {
  const [ready, setReady] = useState(false);
  const [games, setGames] = useState<LuminGame[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<LuminGame | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const rootRef = usePopIn<HTMLDivElement>([]);
  const debounceRef = useRef<number | null>(null);

  const [settings] = useSettings();

  const proxify = (rawUrl: string): string => {
    if (!settings.proxyGames) return rawUrl;
    const sj = (window as unknown as { __axisScramjet?: AxisScramjet })
      .__axisScramjet;
    if (!sj) return rawUrl;
    try {
      const u = new URL(rawUrl);
      return sj.encodeUrl(u.href);
    } catch {
      return rawUrl;
    }
  };

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadLumin();
        if (cancelled || !window.Lumin) return;
        await window.Lumin.init({ headless: true });
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled && !isBridgeDestroyed(err)) console.error(err);
      }
    })();
    return () => {
      cancelled = true;
      try {
        window.Lumin?.destroy();
      } catch {}
    };
  }, []);

  const fetchPage = (targetPage: number, q: string) => {
    if (!ready || !window.Lumin) return;
    setLoading(true);
    window.Lumin
      .getGames({ page: targetPage, limit: ITEMS_PER_PAGE, q })
      .then((res) => {
        setGames(res.games);
        setTotal(res.total);
        setPages(res.pages);
        setPage(res.page);
      })
      .catch((err) => {
        if (!isBridgeDestroyed(err)) console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!ready) return;
    fetchPage(page, query.trim());

  }, [ready, page]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      if (!ready) return;
      setPage(1);
      fetchPage(1, query.trim());
    }, 320);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };

  }, [query]);

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
  }, [games]);

  const changePage = (next: number) => {
    if (next < 1 || next > pages) return;
    setPage(next);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openGame = async (g: LuminGame) => {
    if (!window.Lumin) return;
    try {
      const { url } = await window.Lumin.getGameUrl(g.id);
      setActive(g);
      setActiveUrl(proxify(url));
    } catch (err) {
      if (!isBridgeDestroyed(err)) console.error(err);
    }
  };

  const closeGame = () => {
    setActive(null);
    setActiveUrl(null);
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                ready
                  ? total > 0
                    ? `Search from ${total} games`
                    : "Search games"
                  : "Loading…"
              }
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm !text-white placeholder:text-zinc-500 outline-none"
            />
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl">
          {games.length === 0 && !loading && ready ? (
            <p className="py-10 text-center text-sm text-zinc-400">
              No games found.
            </p>
          ) : null}

          <div
            ref={gridRef}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
          >
            {games.map((g) => (
              <GameCard key={g.id} game={g} onOpen={() => openGame(g)} />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <PageBtn
              disabled={page <= 1 || loading}
              onClick={() => changePage(page - 1)}
              aria-label="Previous"
            >
              <ArrowLeft className="h-4 w-4" />
            </PageBtn>
            <span className="text-sm text-zinc-400">
              Page {page}
              {pages > 1 ? ` of ${pages}` : ""}
            </span>
            <PageBtn
              disabled={page >= pages || loading}
              onClick={() => changePage(page + 1)}
              aria-label="Next"
            >
              <ArrowRight className="h-4 w-4" />
            </PageBtn>
          </div>
        </div>
      </div>

      {activeUrl && active ? (
        <Player
          src={activeUrl}
          title={active.name}
          onClose={closeGame}
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

function GameCard({
  game,
  onOpen,
}: {
  game: LuminGame;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!window.Lumin) return;
    window.Lumin
      .getImageUrl(game.image_token)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [game.image_token]);

  return (
    <button
      type="button"
      onClick={onOpen}
      {...hoverLift(-3)}
      {...pressScale(0.97)}
      className="group relative flex aspect-square flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.04] text-left transition-colors hover:border-white/15"
    >
      {src && !errored ? (
        <img
          src={src}
          alt={game.name}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500">
          {errored ? "No Image" : "Loading…"}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2.5 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <h3 className="truncate text-[13px] font-semibold text-white">
          {game.name}
        </h3>
      </div>
    </button>
  );
}

function Player({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={wrapRef} className="absolute inset-0 z-50 bg-black">
      <iframe
        key={src}
        src={src}
        title={title}
        allow="autoplay; fullscreen; gamepad"
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
    </div>
  );
}
