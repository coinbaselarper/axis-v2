"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Plus,
  RotateCcw,
  Shield,
  X,                                                                      
} from "lucide-react";                                                    
import { useEffect, useMemo, useRef, useState } from "react";                                 
import gsap from "gsap";                                                            
import { buildSearchUrl, DEFAULT_WISP, useSettings } from "../lib/settings";                                
import { hoverLift, pressScale, usePopIn } from "../lib/anim";                          

const scram = "/sail/go/";

type ScramjetV2Frame = {
  prefix: string;
  go: (url: string) => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  fetchHandler?: { client?: { transport?: unknown } };
};

type ScramjetV2Controller = {
  wait: () => Promise<void>;
  createFrame: (element?: HTMLIFrameElement) => ScramjetV2Frame;
  frames: ScramjetV2Frame[];
  prefix: string;
  transport: unknown;
};

declare global {
  interface Window {
    $scramjetController?: {
      Controller: new (init: { serviceworker: ServiceWorker; transport: unknown }) => ScramjetV2Controller;
      config: {
        prefix: string;
        scramjetPath: string;
        injectPath: string;
        wasmPath: string;
      };
    };
    LibcurlTransport?: {
      LibcurlClient: new (opts: { wisp: string }) => unknown;
    };
    __axisController?: ScramjetV2Controller;
  }
}

const VPN_HOST = "geometry.axiseducation.one";
const VPN_KEY = "wisplocation";

type VpnLocation = { id: string; label: string };

const VPN_LOCATIONS: VpnLocation[] = [
  { id: "", label: "Default" },
  { id: "virginia", label: "Virginia" },
  { id: "japan", label: "Japan" },
  { id: "brazil", label: "Brazil" },
  { id: "lax", label: "LAX" },
  { id: "australia", label: "Australia" },
  { id: "chicago", label: "Chicago" },
];

function buildWispUrl(loc: string, fallback: string) {
  if (!loc) return fallback;
  return `wss://${VPN_HOST}/${loc}/`;
}

function normalizeInput(
  value: string,
  engine: "duckduckgo" | "google" | "bing" = "duckduckgo",
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return buildSearchUrl(trimmed, engine);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-axis-src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error(`failed to load ${src}`)),
      );
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset.axisSrc = src;
    el.addEventListener("load", () => {
      el.dataset.loaded = "true";
      resolve();
    });
    el.addEventListener("error", () =>
      reject(new Error(`failed to load ${src}`)),
    );
    document.head.appendChild(el);
  });
}

type Tab = {
  id: string;
  title: string;
  rawUrl: string;
  proxiedUrl: string | null;
  history: string[];
  historyIndex: number;
  reloadKey: number;
  loading: boolean;
};

function makeTab(): Tab {
  return {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "New Tab",
    rawUrl: "",
    proxiedUrl: null,
    history: [],
    historyIndex: -1,
    reloadKey: 0,
    loading: false,
  };
}

const DEFAULT_HOMEPAGE = "";
const TABS_KEY = "axis.browser.tabs.v1";
const ACTIVE_TAB_KEY = "axis.browser.activeTab.v1";

function loadSavedTabs(): { tabs: Tab[]; activeId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const tabs = parsed.map((t) => ({
      id: t.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: t.title ?? "New Tab",
      rawUrl: t.rawUrl ?? "",
      proxiedUrl: t.proxiedUrl ?? null,
      history: Array.isArray(t.history) ? t.history : [],
      historyIndex: typeof t.historyIndex === "number" ? t.historyIndex : -1,
      reloadKey: 0,
      loading: false,
    })) as Tab[];
    const savedActive = window.localStorage.getItem(ACTIVE_TAB_KEY);
    const activeId =
      savedActive && tabs.some((t) => t.id === savedActive)
        ? savedActive
        : tabs[0].id;
    return { tabs, activeId };
  } catch {
    return null;
  }
}

function saveTabs(tabs: Tab[], activeId: string) {
  try {
    const trimmed = tabs.map((t) => ({
      id: t.id,
      title: t.title,
      rawUrl: t.rawUrl,
      proxiedUrl: t.proxiedUrl,
      history: t.history,
      historyIndex: t.historyIndex,
    }));
    window.localStorage.setItem(TABS_KEY, JSON.stringify(trimmed));
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeId);
  } catch {}
}

export default function Browser() {
  const [settings] = useSettings();
  const saved = useRef(typeof window !== "undefined" ? loadSavedTabs() : null);
  const initialTab = useRef<Tab>(saved.current?.tabs[0] ?? makeTab());
  const [tabs, setTabs] = useState<Tab[]>(
    () => saved.current?.tabs ?? [initialTab.current],
  );
  const [activeId, setActiveId] = useState<string>(
    saved.current?.activeId ?? initialTab.current.id,
  );
  const [query, setQuery] = useState("");
  const [scramjetReady, setScramjetReady] = useState(false);
  const scramjetRef = useRef<ScramjetV2Controller | null>(null);
  const frameMapRef = useRef<Map<string, ScramjetV2Frame>>(new Map());
  const pendingNavRef = useRef<{ tabId: string; url: string }[]>([]);
  const tabsHydratedRef = useRef(false);
  const [vpnId, setVpnId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(VPN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [vpnOpen, setVpnOpen] = useState(false);
  const vpnTriggerRef = useRef<HTMLButtonElement | null>(null);
  const vpnMenuRef = useRef<HTMLDivElement | null>(null);
  const vpnLocation =
    VPN_LOCATIONS.find((v) => v.id === vpnId) ?? VPN_LOCATIONS[0];

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeId) ?? tabs[0],
    [tabs, activeId],
  );

  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        await loadScript("/sj/scramjet.js");
        await loadScript("/sj/controller.api.js");
        await loadScript("/lc/index.js");

        let sw: ServiceWorker | null = null;
        if ("serviceWorker" in navigator) {
          const swReg = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });
          try {
            await swReg.update();
          } catch {}
          await navigator.serviceWorker.ready;

          if (!navigator.serviceWorker.controller) {
            const reloadKey = "axis.sw.bootReload";
            const already = sessionStorage.getItem(reloadKey);
            if (!already) {
              sessionStorage.setItem(reloadKey, "1");
              window.location.reload();
              return;
            }
            await new Promise<void>((resolve) => {
              const onChange = () => {
                navigator.serviceWorker.removeEventListener("controllerchange", onChange);
                resolve();
              };
              navigator.serviceWorker.addEventListener("controllerchange", onChange);
              setTimeout(resolve, 3000);
            });
          }
          sw = navigator.serviceWorker.controller;
        }

        if (!sw || !window.$scramjetController || !window.LibcurlTransport) {
          console.error("Missing scramjet v2 dependencies");
          return;
        }

        window.$scramjetController.config.prefix = scram;
        window.$scramjetController.config.scramjetPath = "/sj/scramjet.js";
        window.$scramjetController.config.injectPath = "/sj/controller.inject.js";
        window.$scramjetController.config.wasmPath = "/sj/scramjet.wasm";

        const fallback = settings.wispUrl || DEFAULT_WISP;
        const transport = new window.LibcurlTransport.LibcurlClient({
          wisp: buildWispUrl(vpnId, fallback),
        });

        const controller = new window.$scramjetController.Controller({
          serviceworker: sw,
          transport,
        });
        window.__axisController = controller;
        scramjetRef.current = controller;
        await controller.wait();

        if (cancelled) return;
        setScramjetReady(true);
      } catch (err) {
        console.error("Initialization failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setQuery(activeTab?.rawUrl ?? "");
  }, [activeId, activeTab?.rawUrl]);

  const initialVpnRef = useRef<string>(vpnId);
  useEffect(() => {
    try {
      window.localStorage.setItem(VPN_KEY, vpnId);
    } catch {}
    const isInitial = initialVpnRef.current === vpnId;
    if (!scramjetReady || !scramjetRef.current || !window.LibcurlTransport) return;
    const fallback = settings.wispUrl || DEFAULT_WISP;
    const wisp = buildWispUrl(vpnId, fallback);
    try {
      const newTransport = new window.LibcurlTransport.LibcurlClient({ wisp });
      const controller = scramjetRef.current as unknown as {
        transport: unknown;
        frames: { fetchHandler?: { client?: { transport?: unknown } } }[];
      };
      controller.transport = newTransport;
      for (const frame of controller.frames) {
        if (frame.fetchHandler?.client) {
          frame.fetchHandler.client.transport = newTransport;
        }
      }
    } catch (err) {
      console.error("VPN switch failed", err);
      return;
    }
    if (isInitial) {
      initialVpnRef.current = "__applied__";
      return;
    }
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeId
          ? { ...t, reloadKey: t.reloadKey + 1, loading: !!t.proxiedUrl }
          : t,
      ),
    );
  }, [vpnId, scramjetReady]);

  useEffect(() => {
    if (!vpnOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (vpnMenuRef.current?.contains(t) || vpnTriggerRef.current?.contains(t))
        return;
      setVpnOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVpnOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [vpnOpen]);

  useEffect(() => {
    if (vpnOpen && vpnMenuRef.current) {
      gsap.fromTo(
        vpnMenuRef.current,
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
  }, [vpnOpen]);

  useEffect(() => {
    if (!tabsHydratedRef.current) {
      tabsHydratedRef.current = true;
      return;
    }
    saveTabs(tabs, activeId);
  }, [tabs, activeId]);

  useEffect(() => {
    if (!scramjetReady) return;
    const queue = pendingNavRef.current;
    pendingNavRef.current = [];
    for (const item of queue) {
      navigate(item.url, item.tabId);
    }
    if (!saved.current) {
      const seedTabId = initialTab.current.id;
      const seedTab = tabs.find((t) => t.id === seedTabId);
      if (seedTab && !seedTab.proxiedUrl && !seedTab.rawUrl) {
        navigate(settings.homepage || DEFAULT_HOMEPAGE, seedTabId);
      }
    } else {
      for (const t of tabs) {
        if (t.rawUrl) navigate(t.rawUrl, t.id);
      }
    }
  }, [scramjetReady]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const n = parseInt(e.key, 10);
      if (Number.isNaN(n) || n < 1 || n > 9) return;
      const target = tabs[n - 1];
      if (!target) return;
      e.preventDefault();
      setActiveId(target.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs]);

  const updateTab = (id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const navigate = (url: string, tabId: string = activeId) => {
    if (!url) return;
    const controller = scramjetRef.current;
    if (!controller) {
      console.warn("Scramjet not ready yet");
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      console.error("Invalid URL", url, err);
      return;
    }
    let frame = frameMapRef.current.get(tabId);
    if (!frame) {
      frame = controller.createFrame();
      frameMapRef.current.set(tabId, frame);
    }
    const proxied = frame.prefix + encodeURIComponent(parsed.href);

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const trimmed = t.history.slice(0, t.historyIndex + 1);
        const nextHistory = [...trimmed, proxied];
        return {
          ...t,
          rawUrl: parsed.href,
          proxiedUrl: proxied,
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
          title: parsed.hostname.replace(/^www\./, "") || "New Tab",
          loading: true,
        };
      }),
    );
    setQuery(parsed.href);
  };

  const submit = () => {
    const target = normalizeInput(query, "duckduckgo");
    if (target) navigate(target);
  };

  const skipHistoryRef = useRef<string | null>(null);

  const goBack = () => {
    if (!activeTab) return;
    if (activeTab.historyIndex <= 0) return;
    const next = activeTab.historyIndex - 1;
    skipHistoryRef.current = activeTab.id;
    updateTab(activeTab.id, {
      historyIndex: next,
      proxiedUrl: activeTab.history[next],
      reloadKey: activeTab.reloadKey + 1,
      loading: true,
    });
  };

  const goForward = () => {
    if (!activeTab) return;
    if (activeTab.historyIndex >= activeTab.history.length - 1) return;
    const next = activeTab.historyIndex + 1;
    skipHistoryRef.current = activeTab.id;
    updateTab(activeTab.id, {
      historyIndex: next,
      proxiedUrl: activeTab.history[next],
      reloadKey: activeTab.reloadKey + 1,
      loading: true,
    });
  };

  const reload = () => {
    if (!activeTab) return;
    updateTab(activeTab.id, {
      reloadKey: activeTab.reloadKey + 1,
      loading: true,
    });
  };

  const addTab = (url?: string) => {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveId(t.id);
    const target = url ?? settings.homepage ?? DEFAULT_HOMEPAGE;
    if (scramjetRef.current) {
      setTimeout(() => navigate(target, t.id), 0);
    } else {
      pendingNavRef.current.push({ tabId: t.id, url: target });
    }
  };

  const closeTab = (id: string) => {
    const el = tabsRowRef.current?.querySelector<HTMLDivElement>(
      `[data-tab-id="${id}"]`,
    );
    const finish = () => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const replacement = makeTab();
          setActiveId(replacement.id);
          return [replacement];
        }
        if (id === activeId) {
          const fallback = next[Math.max(0, idx - 1)];
          setActiveId(fallback.id);
        }
        return next;
      });
    };
    if (el) {
      gsap.to(el, {
        opacity: 0,
        scale: 0.7,
        x: -8,
        duration: 0.18,
        ease: "power2.in",
        onComplete: finish,
      });
    } else {
      finish();
    }
  };

  const handleFrameLoad = (
    tabId: string,
    iframe: HTMLIFrameElement | null,
  ) => {
    if (!iframe) return;
    let realUrl = "";
    try {
      const cw = iframe.contentWindow;
      if (!cw) return;
      realUrl = cw.location.href;
    } catch {
      return;
    }

    if (realUrl.includes(scram)) {
      const frame = frameMapRef.current.get(tabId);
      if (frame && realUrl.includes(frame.prefix)) {
        try {
          const idx = realUrl.indexOf(frame.prefix);
          const encoded = realUrl.slice(idx + frame.prefix.length).split(/[?#]/)[0];
          realUrl = decodeURIComponent(encoded);
        } catch {}
      } else {
        try {
          const idx = realUrl.indexOf(scram);
          const encoded = realUrl.slice(idx + scram.length).split(/[?#]/)[0];
          realUrl = decodeURIComponent(encoded);
        } catch {}
      }
    }

    if (!realUrl || realUrl.includes(scram)) return;

    let parsed: URL;
    try {
      parsed = new URL(realUrl);
    } catch {
      return;
    }

    const skipHistory = skipHistoryRef.current === tabId;
    if (skipHistory) skipHistoryRef.current = null;

    const frame = frameMapRef.current.get(tabId);
    const newProxied = frame ? frame.prefix + encodeURIComponent(parsed.href) : null;

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        if (skipHistory || t.rawUrl === parsed.href) {
          return {
            ...t,
            rawUrl: parsed.href,
            title: parsed.hostname.replace(/^www\./, "") || t.title,
            loading: false,
          };
        }
        const trimmed = t.history.slice(0, t.historyIndex + 1);
        const nextHistory = newProxied
          ? [...trimmed, newProxied]
          : trimmed;
        return {
          ...t,
          rawUrl: parsed.href,
          proxiedUrl: newProxied ?? t.proxiedUrl,
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
          title: parsed.hostname.replace(/^www\./, "") || t.title,
          loading: false,
        };
      }),
    );
  };

  const tabsRowRef = useRef<HTMLDivElement | null>(null);
  const prevTabsLenRef = useRef<number>(tabs.length);
  const toolbarRef = usePopIn<HTMLDivElement>([]);

  useEffect(() => {
    if (
      tabs.length > prevTabsLenRef.current &&
      tabsRowRef.current
    ) {
      const children = tabsRowRef.current.children;
      const tabEls = Array.from(children).slice(0, tabs.length);
      const newest = tabEls[tabEls.length - 1] as HTMLElement | undefined;
      if (newest) {
        gsap.fromTo(
          newest,
          { opacity: 0, scale: 0.8, x: -10 },
          {
            opacity: 1,
            scale: 1,
            x: 0,
            duration: 0.3,
            ease: "back.out(2)",
            clearProps: "transform",
          },
        );
      }
    }
    prevTabsLenRef.current = tabs.length;
  }, [tabs.length]);

  const canBack = !!activeTab && activeTab.historyIndex > 0;
  const canForward =
    !!activeTab && activeTab.historyIndex < activeTab.history.length - 1;

  return (
    <div
      ref={toolbarRef}
      className="relative flex h-full w-full flex-col overflow-hidden text-zinc-200"
    >
      <div
        ref={tabsRowRef}
        className="no-scrollbar flex w-full shrink-0 items-center gap-1.5 overflow-x-auto px-2 pt-2"
      >
        {tabs.map((t) => (
          <div
            key={t.id}
            data-tab-id={t.id}
            onClick={() => setActiveId(t.id)}
            className={`relative flex h-10 w-[200px] min-w-[120px] shrink-0 cursor-default items-center gap-2 overflow-hidden rounded-2xl border px-3 text-sm transition ${
              t.id === activeId
                ? "border-white/10 bg-white/[0.10]"
                : "border-white/[0.04] bg-white/[0.05] hover:bg-white/[0.08]"
            }`}
          >
            <TabIcon rawUrl={t.rawUrl} loading={t.loading} />

            <span
              className="flex-1 overflow-hidden whitespace-nowrap text-[13px] font-medium text-zinc-200"
              style={{
                maskImage: "linear-gradient(to right, black 60%, transparent 95%)",
                WebkitMaskImage:
                  "linear-gradient(to right, black 60%, transparent 95%)",
              }}
            >
              {t.title}
            </span>
            <button
              type="button"
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.id);
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/15 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => addTab()}
          aria-label="New tab"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.04] bg-white/[0.05] text-zinc-200 transition hover:border-white/10 hover:bg-white/[0.10]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 px-2 pt-2 pb-2">
        <ChromeButton onClick={goBack} disabled={!canBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </ChromeButton>
        <ChromeButton
          onClick={goForward}
          disabled={!canForward}
          aria-label="Forward"
        >
          <ArrowRight className="h-4 w-4" />
        </ChromeButton>
        <ChromeButton onClick={reload} aria-label="Reload">
          <RotateCcw className="h-4 w-4" />
        </ChromeButton>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Search or enter URL"
          className="h-10 flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.05] px-4 text-sm !text-white placeholder:text-zinc-500 outline-none transition focus:border-white/20 focus:bg-white/[0.10]"
        />
        <div className="relative shrink-0">
          <button
            ref={vpnTriggerRef}
            type="button"
            onClick={() => setVpnOpen((v) => !v)}
            {...hoverLift(-1)}
            {...pressScale(0.92)}
            aria-label="VPN"
            className={`flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-sm transition-colors ${
              vpnId
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                : "border-white/[0.04] bg-white/[0.05] text-zinc-200 hover:border-white/10 hover:bg-white/[0.10]"
            }`}
          >
            <Shield className="h-4 w-4" />
            <span className="text-[13px] font-medium">{vpnLocation.label}</span>
          </button>
          {vpnOpen ? (
            <div
              ref={vpnMenuRef}
              className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0a0a0a]/95 p-1 shadow-xl backdrop-blur"
            >
              {VPN_LOCATIONS.map((loc, i) => {
                const selected = loc.id === vpnId;
                return (
                  <div key={loc.id || "default"}>
                    {i > 0 ? (
                      <div className="my-1 h-px bg-white/[0.06]" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setVpnId(loc.id);
                        setVpnOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "bg-white/[0.10] text-white"
                          : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span>{loc.label}</span>
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

      <div className="relative mx-2 mb-2 flex-1 overflow-hidden rounded-xl border border-white/[0.06]">
        {tabs.map((t) =>
          t.proxiedUrl && scramjetReady ? (
            <iframe
              key={`${t.id}-${t.reloadKey}`}
              src={t.proxiedUrl}
              title={t.title}
              allow="autoplay; fullscreen; gamepad"
              onLoad={(e) => handleFrameLoad(t.id, e.currentTarget)}
              className={`absolute inset-0 h-full w-full rounded-xl border-0 bg-white transition-opacity ${
                t.id === activeId
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            />
          ) : (
            <div
              key={t.id}
              className={`absolute inset-0 rounded-xl transition-opacity ${
                t.id === activeId
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <HomeLanding
                engine={settings.searchEngine}
                onOpen={(url) => {
                  if (settings.openInNewTab && t.id !== activeId) {
                    addTab(url);
                  } else {
                    navigate(url, t.id);
                  }
                }}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function TabIcon({ rawUrl, loading }: { rawUrl: string; loading: boolean }) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  let host = "";
  try {
    if (rawUrl) host = new URL(rawUrl).hostname;
  } catch {}

  useEffect(() => {
    setErrored(false);
    setLoaded(false);
    if (wrapRef.current) {
      gsap.fromTo(
        wrapRef.current,
        { rotate: -20, scale: 0.7 },
        {
          rotate: 0,
          scale: 1,
          duration: 0.4,
          ease: "back.out(2.5)",
          clearProps: "transform",
        },
      );
    }
  }, [host]);

  useEffect(() => {
    if (loaded && imgRef.current) {
      gsap.fromTo(
        imgRef.current,
        { opacity: 0, scale: 0.4, rotate: -30 },
        {
          opacity: 1,
          scale: 1,
          rotate: 0,
          duration: 0.32,
          ease: "back.out(2)",
          clearProps: "transform",
        },
      );
    }
  }, [loaded]);

  const showFavicon = host && !errored;
  return (
    <span
      ref={wrapRef}
      className="relative flex h-4 w-4 shrink-0 items-center justify-center text-zinc-300"
    >
      {loading ? (
        <span
          className="absolute inset-0 rounded-full border border-white/15 border-t-white/70"
          style={{ animation: "axis-spin 0.7s linear infinite" }}
        />
      ) : null}
      {showFavicon ? (
        <img
          ref={imgRef}
          src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
          alt=""
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className="h-3.5 w-3.5 rounded-sm"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      ) : (
        <Globe className="h-3.5 w-3.5" />
      )}
    </span>
  );
}

function ChromeButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...hoverLift(-1)}
      {...pressScale(0.9)}
      {...rest}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/[0.04] bg-white/[0.05] text-zinc-200 transition-colors hover:border-white/10 hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}

function HomeLanding({
  onOpen: _onOpen,
  engine: _engine,
}: {
  onOpen: (url: string) => void;
  engine: "duckduckgo" | "google" | "bing";
}) {
  void _onOpen;
  void _engine;
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0a0a0a]">
      <Clock />
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return <div className="h-[140px]" />;
  }

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const date = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="font-[family-name:var(--font-geist-sans)] text-[8rem] font-light leading-none tracking-tight text-white tabular-nums">
        {time}
      </div>
      <div className="text-base font-medium text-zinc-400">{date}</div>
    </div>
  );
}
