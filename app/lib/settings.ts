"use client";



import { useEffect, useRef, useSyncExternalStore } from "react";



export type AxisTheme =

  | "default"

  | "midnight"

  | "slate"

  | "ember"

  | "forest"

  | "chalk"

  | "nord"

  | "dracula"

  | "gruvbox"

  | "monokai"

  | "blood"

  | "ocean"

  | "cobalt"

  | "amber"

  | "mint"

  | "sand";



export type AxisSettings = {

  theme: AxisTheme;

  cloakTitle: string;

  cloakDomain: string;

  homepage: string;

  searchEngine: "duckduckgo" | "google" | "bing";

  openInNewTab: boolean;

  wispUrl: string;

  proxyGames: boolean;

  proxyMovies: boolean;

};



export const DEFAULT_WISP = "wss://geometry.axiseducation.one/";



export const WISP_PRESETS: { label: string; url: string }[] = [

  { label: "Axis Geometry (default)", url: "wss://geometry.axiseducation.one/" },

  { label: "Mercury Workshop", url: "wss://wisp.mercurywork.shop/" },

  { label: "Anura", url: "wss://anura.pro/" },

];



export const defaultSettings: AxisSettings = {

  theme: "nord",

  cloakTitle: "Google",

  cloakDomain: "google.com",

  homepage: "https://duckduckgo.com",

  searchEngine: "duckduckgo",

  openInNewTab: true,

  wispUrl: DEFAULT_WISP,

  proxyGames: false,

  proxyMovies: false,

};



const STORAGE_KEY = "axis.settings.v1";

const EVENT = "axis:settings-change";



const ABOUT_BLANK_ICON =

  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMTZDMy41ODE3IDE2IDAgMTIuNDE4MyAwIDhDMCAzLjU4MTcgMy41ODE3IDAgOCAwQzEyLjQxODMgMCAxNiAzLjU4MTcgMTYgOEMxNiAxMi40MTgzIDEyLjQxODMgMTYgOCAxNlpNOCAxNEMzLjY4NjI5IDE0IDEgMTEuMzEzNyAxIDhDMSA0LjY4NjI5IDMuNjg2MjkgMSA4IDFDMTEuMzEzNyAxIDE0IDQuNjg2MjkgMTQgOEMxNCAxMS4zMTM3IDExLjMxMzcgMTQgOCAxNFpNNiAyLjVWNC41QzYgNS4wNTIyOCA2LjQ0NzcyIDUuNSA3IDUuNUM3LjU1MjI4IDUuNSA4IDUuMDUyMjggOCA0LjVWMi41QzggMS45NDc3MiA3LjU1MjI4IDEuNSA3IDEuNUM2LjQ0NzcyIDEuNSA2IDEuOTQ3MiA2IDIuNVpNOCA2LjVWMTMuNUM4IDE0LjA1MjMgNy41NTIyOCAxNC41IDcgMTQuNUM2LjQ0NzcyIDE0LjUgNiAxNC4wNTIzIDYgMTMuNVY2LjVDNiA1Ljk0NzcyIDYuNDQ3NzIgNS41IDcgNS41QzcuNTUyMjggNS41IDggNS45NDc3MiA4IDYuNVoiIGZpbGw9IiM4ODg4ODgiLz4KPC9zdmc+";



let current: AxisSettings = defaultSettings;

let hydrated = false;



function read(): AxisSettings {

  if (typeof window === "undefined") return defaultSettings;

  try {

    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) return defaultSettings;

    const parsed = JSON.parse(raw);

    return { ...defaultSettings, ...parsed } as AxisSettings;

  } catch {

    return defaultSettings;

  }

}



function ensureHydrated() {

  if (hydrated || typeof window === "undefined") return;

  current = read();

  hydrated = true;

}



function emit() {

  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(EVENT));

}



function subscribe(listener: () => void) {

  if (typeof window === "undefined") return () => {};

  const onChange = () => listener();

  const onStorage = (e: StorageEvent) => {

    if (e.key === STORAGE_KEY) {

      current = read();

      listener();

    }

  };

  window.addEventListener(EVENT, onChange);

  window.addEventListener("storage", onStorage);

  return () => {

    window.removeEventListener(EVENT, onChange);

    window.removeEventListener("storage", onStorage);

  };

}



function getSnapshot() {

  ensureHydrated();

  return current;

}



function getServerSnapshot() {

  return defaultSettings;

}



export function useSettings(): [

  AxisSettings,

  <K extends keyof AxisSettings>(key: K, value: AxisSettings[K]) => void,

  (patch: Partial<AxisSettings>) => void,

] {

  const settings = useSyncExternalStore(

    subscribe,

    getSnapshot,

    getServerSnapshot,

  );

  const set = <K extends keyof AxisSettings>(

    key: K,

    value: AxisSettings[K],

  ) => {

    current = { ...current, [key]: value };

    try {

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    } catch {}

    emit();

  };

  const patch = (patch: Partial<AxisSettings>) => {

    current = { ...current, ...patch };

    try {

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));

    } catch {}

    emit();

  };

  return [settings, set, patch];

}



export function getSettings(): AxisSettings {

  ensureHydrated();

  return current;

}



const searchTemplates: Record<AxisSettings["searchEngine"], string> = {

  duckduckgo: "https://duckduckgo.com/?q=",

  google: "https://www.google.com/search?q=",

  bing: "https://www.bing.com/search?q=",

};



export function buildSearchUrl(

  query: string,

  engine: AxisSettings["searchEngine"],

) {

  return `${searchTemplates[engine]}${encodeURIComponent(query)}`;

}



export function faviconFor(domain: string) {

  if (!domain) return null;

  if (domain === "about:blank") return ABOUT_BLANK_ICON;

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

}



function setFaviconHref(url: string) {

  const existing = document.head.querySelectorAll<HTMLLinkElement>(

    "link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']",

  );

  existing.forEach((el) => el.parentNode?.removeChild(el));

  const link = document.createElement("link");

  link.rel = "icon";

  if (url.startsWith("data:image/svg")) link.type = "image/svg+xml";

  else if (/\.png(\?|$)/i.test(url) || url.includes("s2/favicons"))

    link.type = "image/png";

  link.href = url;

  document.head.appendChild(link);

}



export function useApplySettings() {

  const [settings] = useSettings();

  const originalTitle = useRef<string | null>(null);

  const originalIcon = useRef<string | null>(null);



  useEffect(() => {

    if (originalTitle.current === null) {

      originalTitle.current = document.title;

    }

    if (originalIcon.current === null) {

      const link = document.querySelector<HTMLLinkElement>(

        "link[rel~='icon']",

      );

      originalIcon.current = link?.href ?? "/favicon.ico";

    }

  }, []);



  useEffect(() => {

    document.documentElement.dataset.theme = settings.theme;

  }, [settings.theme]);



  useEffect(() => {

    const desired =

      settings.cloakTitle || originalTitle.current || document.title;

    if (document.title !== desired) document.title = desired;

    if (!settings.cloakTitle) return;



    const titleEl = document.querySelector("title");

    if (!titleEl) return;

    const observer = new MutationObserver(() => {

      if (document.title !== desired) document.title = desired;

    });

    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });

    return () => observer.disconnect();

  }, [settings.cloakTitle]);



  useEffect(() => {

    const icon = faviconFor(settings.cloakDomain);

    if (icon) {

      setFaviconHref(icon);

    } else if (originalIcon.current) {

      setFaviconHref(originalIcon.current);

    }

  }, [settings.cloakDomain]);

}

