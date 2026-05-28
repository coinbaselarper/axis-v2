"use client";

import { useState } from "react";
import AI from "./pages/AI";
import Browser from "./pages/Browser";
import Chat from "./pages/Chat";
import Games from "./pages/Games";
import Movies from "./pages/Entertainment";
import Music from "./pages/Music";
import Navbar, { type View } from "./pages/Navbar";
import Settings from "./pages/Settings";
import ChatSidebar from "./pages/ChatSidebar";
import VMs from "./pages/vms";
import LoginGate from "./pages/login";
import { useApplySettings } from "./lib/settings";
import { useFadeSwap } from "./lib/anim";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";
import { MusicProvider } from "./lib/music";
import { AuthProvider } from "./lib/auth";

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useApplySettings();
  const viewRef = useFadeSwap<HTMLDivElement>(view);

  const handleSelect = (v: View) => {
    setView(v);
  };

  return (
    <AuthProvider>
    <MusicProvider>
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <main className="absolute inset-0 p-4 pb-20">
        <div
          className="relative h-full w-full overflow-hidden rounded-2xl border border-white/80"
          style={{ background: "var(--axis-bg)" }}
        >
          <DottedGlowBackground
            className="pointer-events-none absolute inset-0 z-0"
            gap={22}
            radius={1.4}
            color="rgba(255,255,255,0.5)"
            glowColor="rgba(255,255,255,0.9)"
          />

          <div ref={viewRef} className="relative z-10 h-full w-full">
            <div className={view === "chat" ? "h-full w-full" : "hidden"}>
              <Chat />
            </div>
            {view === "games" && <Games />}
            {view === "browser" && <Browser />}
            {view === "ai" && <AI />}
            {view === "vms" && <VMs />}
            {view === "movies" && <Movies />}
            {view === "music" && <Music />}
            {view === "settings" && <Settings />}
            {view === "home" && <HomeHero />}
          </div>
        </div>
      </main>

      {view !== "chat" && <ChatSidebar isOpen={sidebarOpen} onOpenChange={setSidebarOpen} />}
      <Navbar active={view} onSelect={handleSelect} sidebarOpen={sidebarOpen} />
    </div>
    </MusicProvider>
    </AuthProvider>
  );
}

function HomeHero() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <h1
        className="font-[family-name:var(--font-geist-sans)] text-8xl font-semibold tracking-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.6)]"
        style={{ color: "var(--axis-accent)" }}
      >
        Axis V2
      </h1>
    </div>
  );
}