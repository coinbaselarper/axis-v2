"use client";

import {
  Film,
  Gamepad2,
  Globe2,
  Home,
  Monitor,
  Music as MusicIcon,
  Pause,
  Play,
  Settings2,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { hoverLift, pressScale, usePopIn, useStaggerIn } from "../lib/anim";
import { useMusicPlayer } from "../lib/music";

export type View =
  | "home"
  | "games"
  | "browser"
  | "ai"
  | "vms"
  | "movies"
  | "music"
  | "settings"
  | "chat"

type NavItem = {
  key: View;
  label: string;
  icon: React.ReactNode;
};

const items: NavItem[] = [
  { key: "home",     label: "Home",      icon: <Home className="h-4 w-4" /> },
  { key: "games",    label: "Games",     icon: <Gamepad2 className="h-4 w-4" /> },
  { key: "browser",  label: "Browser",   icon: <Globe2 className="h-4 w-4" /> },
  { key: "movies",   label: "Movies",    icon: <Film className="h-4 w-4" /> },
  { key: "music",    label: "Music",     icon: <MusicIcon className="h-4 w-4" /> },
  { key: "ai",       label: "axis ai",  icon: <Sparkles className="h-4 w-4" /> },
  { key: "vms",      label: "VMs",       icon: <Monitor className="h-4 w-4" /> },
  { key: "chat",     label: "Chat",      icon: <MessageCircle className="h-4 w-4" /> },
];

type Props = {
  active: View;
  onSelect: (v: View) => void;
  sidebarOpen?: boolean;
};

export default function Navbar({ active, onSelect }: Props) {
  const navRef = usePopIn<HTMLElement>([]);
  const itemsRef = useStaggerIn<HTMLDivElement>([], { y: 8, stagger: 0.05 });
  const { active: track, playing, togglePlay } = useMusicPlayer();

  return (
    <nav
      ref={navRef}
      className="fixed inset-x-4 bottom-4 z-40 flex h-12 flex-row items-center justify-between overflow-hidden rounded-xl border border-white/[0.06] px-3 text-zinc-400 backdrop-blur-md"
      style={{ background: "color-mix(in srgb, var(--axis-bg) 60%, transparent)" }}
    >
<div ref={itemsRef} className="flex flex-row items-center gap-2">
        {items.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={item.key === active}
            onClick={() => onSelect(item.key)}
          />
        ))}
      </div>

      <div className="flex flex-row items-center gap-2">
        {track && (
          <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1">
            <div className="h-6 w-6 shrink-0 overflow-hidden rounded">
              {track.artwork ? (
                <img src={track.artwork} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/[0.06]">
                  <MusicIcon className="h-3 w-3 text-zinc-500" />
                </div>
              )}
            </div>
            <div className="flex w-28 min-w-0 flex-col">
              <span className="truncate text-[11px] font-medium leading-tight text-zinc-200">
                {track.title}
              </span>
              <span className="truncate text-[10px] leading-tight text-zinc-500">
                {track.artist}
              </span>
            </div>
            <button
              type="button"
              onClick={togglePlay}
              {...pressScale(0.9)}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200"
            >
              {playing ? (
                <Pause className="h-3 w-3" />
              ) : (
                <Play className="ml-[1px] h-3 w-3" />
              )}
            </button>
          </div>
        )}

        <button
          aria-label="Settings"
          onClick={() => onSelect("settings")}
          {...hoverLift(-1)}
          {...pressScale(0.92)}
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
            active === "settings"
              ? "bg-white/10 text-white"
              : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
          }`}
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={item.label}
      onClick={onClick}
      {...hoverLift(-1)}
      {...pressScale(0.92)}
      className={[
        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-white/10 text-white"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      ].join(" ")}
    >
      {item.icon}
    </button>
  );
}
