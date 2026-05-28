"use client";

import { ArrowRight, EyeOff, Info, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFadeSwap, usePopIn, useStaggerIn } from "../lib/anim";
import {
  type AxisTheme,
  faviconFor,
  useApplySettings,
  useSettings,
} from "../lib/settings";
type Section = "cloak" | "theme" | "about";

type Preset = { title: string; domain: string };

const presets: Preset[] = [
  { title: "Google", domain: "google.com" },
  { title: "Classroom", domain: "classroom.google.com" },
  { title: "i-Ready", domain: "i-ready.com" },
  { title: "Khan Academy", domain: "khanacademy.org" },
  { title: "Quizlet", domain: "quizlet.com" },
  { title: "Schoology", domain: "schoology.com" },
  { title: "Canvas", domain: "instructure.com" },
  { title: "Newsela", domain: "newsela.com" },
];

type ThemeDef = {
  key: AxisTheme;
  name: string;
  bg: string;
  swatches: [string, string, string];
};

const themes: ThemeDef[] = [
  {
    key: "default",
    name: "default",
    bg: "#141414",
    swatches: ["#2a2a2a", "#555", "#e8e8e8"],
  },
  {
    key: "midnight",
    name: "midnight",
    bg: "#0a0a12",
    swatches: ["#1a1a2e", "#3d3d6b", "#a78bfa"],
  },
  {
    key: "slate",
    name: "slate",
    bg: "#0c1220",
    swatches: ["#1e2d45", "#3d5a80", "#90caf9"],
  },
  {
    key: "ember",
    name: "ember",
    bg: "#110800",
    swatches: ["#2b1500", "#7a3310", "#fb923c"],
  },
  {
    key: "forest",
    name: "forest",
    bg: "#060e0a",
    swatches: ["#112218", "#1f4d30", "#4ade80"],
  },
  {
    key: "chalk",
    name: "chalk",
    bg: "#f0ede8",
    swatches: ["#d8d2c8", "#7a7068", "#1a1714"],
  },
  {
    key: "nord",
    name: "nord",
    bg: "#2e3440",
    swatches: ["#3b4252", "#81a1c1", "#8fbcbb"],
  },
  {
    key: "dracula",
    name: "dracula",
    bg: "#282a36",
    swatches: ["#44475a", "#bd93f9", "#ff79c6"],
  },
  {
    key: "gruvbox",
    name: "gruvbox",
    bg: "#1d2021",
    swatches: ["#3c3836", "#a89984", "#fabd2f"],
  },
  {
    key: "monokai",
    name: "monokai",
    bg: "#272822",
    swatches: ["#3e3d32", "#75715e", "#a6e22e"],
  },
  {
    key: "blood",
    name: "blood",
    bg: "#1a0f15",
    swatches: ["#3a1a26", "#9f3d57", "#f43f5e"],
  },
  {
    key: "ocean",
    name: "ocean",
    bg: "#001f2e",
    swatches: ["#003a52", "#0891b2", "#06b6d4"],
  },
  {
    key: "cobalt",
    name: "cobalt",
    bg: "#001433",
    swatches: ["#002966", "#1e6fd9", "#38bdf8"],
  },
  {
    key: "amber",
    name: "amber",
    bg: "#1a0f00",
    swatches: ["#3d2400", "#b07a14", "#fbbf24"],
  },
  {
    key: "mint",
    name: "mint",
    bg: "#04140d",
    swatches: ["#0c2e1f", "#2d8a64", "#6ee7b7"],
  },
  {
    key: "sand",
    name: "sand",
    bg: "#faf3e3",
    swatches: ["#e5d9b8", "#92400e", "#3a2410"],
  },
];

export default function Settings() {
  const [active, setActive] = useState<Section>("cloak");
  useApplySettings();

  const [toast, setToast] = useState<{ label: string; value?: string } | null>(
    null,
  );
  const toastTimer = useRef<number | null>(null);
  const showToast = (label: string, value?: string) => {
    setToast({ label, value });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  };
  useEffect(() => {
    import("../api/ads/ads");
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const rootRef = usePopIn<HTMLDivElement>([]);
  const navRef = useStaggerIn<HTMLElement>([], { y: 8, stagger: 0.06 });
  const mainRef = useFadeSwap<HTMLElement>(active);

  return (
    <div ref={rootRef} className="axis-settings h-full w-full overflow-hidden">
      <div className="layout">
        <nav ref={navRef} className="sidebar">
          <div className="logo">
            AXIS
            <span>settings</span>
          </div>
          <NavItem
            label="cloak"
            icon={<EyeOff size={14} />}
            active={active === "cloak"}
            onClick={() => setActive("cloak")}
          />
          <NavItem
            label="theme"
            icon={<Palette size={14} />}
            active={active === "theme"}
            onClick={() => setActive("theme")}
          />
          <NavItem
            label="about"
            icon={<Info size={14} />}
            active={active === "about"}
            onClick={() => setActive("about")}
          />
        </nav>

        <main ref={mainRef} className="main">
          {active === "cloak" ? <CloakSection onToast={showToast} /> : null}
          {active === "theme" ? <ThemeSection onToast={showToast} /> : null}
          {active === "about" ? <AboutSection /> : null}
        </main>
      </div>

      <div className={`axis-toast ${toast ? "show" : ""}`}>
        {toast ? (
          <span className="flex items-center gap-1.5">
            <span>{toast.label}</span>
            {toast.value ? (
              <>
                <ArrowRight size={11} strokeWidth={2} />
                <span>{toast.value}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span className="flex h-4 w-4 items-center justify-center opacity-60">
        {icon}
      </span>
      {label}
    </button>
  );
}

function CloakSection({ onToast }: { onToast: (label: string, value?: string) => void }) {
  const [settings, , patch] = useSettings();
  const [titleInput, setTitleInput] = useState("");
  const [domainInput, setDomainInput] = useState("");

  const previewIcon = faviconFor(settings.cloakDomain) ?? "/favicon.ico";
  const previewTitle = (settings.cloakTitle || "axis").toLowerCase();

  const applyPreset = (p: Preset) => {
    patch({ cloakTitle: p.title, cloakDomain: p.domain });
    onToast("disguise", p.title.toLowerCase());
  };

  const applyCustom = () => {
    const title = titleInput.trim();
    const domain = domainInput.trim();
    if (!title && !domain) {
      onToast("enter a title or domain");
      return;
    }
    patch({
      cloakTitle: title || settings.cloakTitle,
      cloakDomain: domain || settings.cloakDomain,
    });
    onToast("custom disguise applied");
  };

  const reset = () => {
    patch({ cloakTitle: "", cloakDomain: "" });
    setTitleInput("");
    setDomainInput("");
    onToast("disguise reset");
  };

  return (
    <>
      <div className="section-header">
        <div className="section-title">cloak</div>
        <div className="section-sub">
          change tab title + favicon to blend in
        </div>
      </div>

      <div className="card">
        <div className="card-label">presets</div>
        <div className="preset-grid">
          {presets.map((p) => (
            <button
              key={p.domain}
              type="button"
              className={`preset-btn ${
                settings.cloakDomain === p.domain ? "active" : ""
              }`}
              onClick={() => applyPreset(p)}
            >
              <img
                className="preset-icon"
                src={`https://www.google.com/s2/favicons?domain=${p.domain}&sz=32`}
                alt=""
                width={16}
                height={16}
              />
              {p.title}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-label">custom</div>
        <div className="input-col">
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="tab title"
          />
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="domain (e.g. google.com)"
          />
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={applyCustom}>
            apply
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            reset
          </button>
        </div>
        <div className="tab-preview">
          <img src={previewIcon} alt="" width={14} height={14} />
          <span className="tab-preview-title">{previewTitle}</span>
        </div>
      </div>
    </>
  );
}

function ThemeSection({ onToast }: { onToast: (label: string, value?: string) => void }) {
  const [settings, set] = useSettings();

  const apply = (t: ThemeDef) => {
    set("theme", t.key);
    onToast("theme", t.name);
  };

  return (
    <>
      <div className="section-header">
        <div className="section-title">theme</div>
        <div className="section-sub">pick a color scheme</div>
      </div>
      <div className="card">
        <div className="card-label">schemes</div>
        <div className="theme-grid">
          {themes.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`theme-card ${settings.theme === t.key ? "active" : ""}`}
              onClick={() => apply(t)}
            >
              <div className="swatch-preview" style={{ background: t.bg }}>
                <div
                  className="sw"
                  style={{ background: t.swatches[0], height: "50%" }}
                />
                <div
                  className="sw"
                  style={{ background: t.swatches[1], height: "72%" }}
                />
                <div
                  className="sw"
                  style={{ background: t.swatches[2], height: "100%" }}
                />
              </div>
              <div className="theme-name">{t.name}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

type Dev = { name: string; avatar: string };

const developers: Dev[] = [
  { name: "decayed", avatar: "https://avatars.githubusercontent.com/u/226577617?v=4" },
];

const credits: Dev[] = [
  {
    name: "carbon",
    avatar: "https://avatars.githubusercontent.com/u/215186372?v=4",
  },
  {
    name: "x8r",
    avatar: "https://avatars.githubusercontent.com/u/159058655?v=5",
  }
];


function AboutSection() {
  return (
    <>
      <div className="section-header">
        <div className="section-title">about</div>
        <div className="section-sub">axis — project info</div>
      </div>

      <div className="card">
        <div className="card-label">project</div>
        <div className="info-row">
          <span className="info-key">name</span>
          <span className="info-val">Axis</span>
        </div>
        <div className="info-row">
          <span className="info-key">version</span>
          <span className="info-val">
            v1.0.0<span className="badge">RELEASE</span>
          </span>
        </div>
        <div className="info-row">
          <span className="info-key">description</span>
          <span className="info-val">TOTALLY an educational site.</span>
        </div>
      </div>

      <div className="card">
        <div className="card-label">developers</div>
        <div className="dev-chips">
          {developers.map((d) => (
            <div key={d.name} className="dev-chip">
              <img className="dev-av" src={d.avatar} alt="" />
              {d.name}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-label">credits</div>
        <div className="dev-chips">
          {credits.map((d) => (
            <div key={d.name} className="dev-chip">
              <img className="dev-av" src={d.avatar} alt="" />
              {d.name}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-label">links</div>
        <div className="info-row">
          <span className="info-key">discord</span>
          <span className="info-val">.gg/hUYzETaQ9U</span>
        </div>
        <div className="info-row">
          <span className="info-key">tiktok</span>
          <span className="info-val">@axis.proxy</span>
        </div>
      </div>
    </>
  );
}
