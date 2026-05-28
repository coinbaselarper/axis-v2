"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, Copy, Globe, Loader2, LogOut, MessageSquare, Plus,
  Send, Tv, Users,
} from "lucide-react";

type Room = {
  id: string;
  title: string;
  owner: string;
  startUrl: string;
  width: number;
  height: number;
  createdAt: number;
  lastActiveAt: number;
  participants: Participant[];
};

type Participant = { pid: string; name: string; joinedAt: number };
type ChatMsg = { id: string; from: string; text: string; ts: number };

type MetaPayload = {
  t: "meta";
  id: string;
  title: string;
  owner: string;
  width: number;
  height: number;
  url: string;
  you: { pid: string; name: string };
  participants: Participant[];
  history: ChatMsg[];
};

const NAME_KEY = "axis.vms.name.v1";
const ACCENT = "#3b82f6";

function loadName(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; }
}
function saveName(n: string) {
  try { localStorage.setItem(NAME_KEY, n); } catch {}
}
function guestName(): string {
  return `Guest-${Math.random().toString(36).slice(2, 6)}`;
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];
  return palette[h % palette.length];
}

function initials(name: string): string {
  const parts = name.split(/[\s\-_]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function VMs() {
  const [name, setName] = useState<string>("");
  useEffect(() => {
    const existing = loadName();
    if (existing) { setName(existing); return; }
    const g = guestName();
    saveName(g);
    setName(g);
  }, []);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  if (!name) return null;

  if (activeRoomId) {
    return <RoomView roomId={activeRoomId} name={name} onLeave={() => setActiveRoomId(null)} />;
  }
  return <Lobby name={name} onName={(n) => { setName(n); saveName(n); }} onJoin={setActiveRoomId} />;
}

function Lobby({ name, onName, onJoin }: { name: string; onName: (n: string) => void; onJoin: (id: string) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [joinId, setJoinId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("https://duckduckgo.com");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const r = await fetch("/api/vms/rooms", { credentials: "include" });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || "Failed to load"); setRooms([]); return; }
      setRooms(j.rooms || []);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const create = async () => {
    setCreating(true);
    setError("");
    try {
      const r = await fetch("/api/vms/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ startUrl: newUrl, title: newTitle.trim() || `${name}'s room` }),
      });
      const j = await r.json();
      if (!r.ok) { setError(j?.error || "Create failed"); return; }
      onJoin(j.session.id);
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-8 pt-6">
        <div className="flex items-center gap-2 text-zinc-300">
          <Tv className="h-5 w-5" />
          <span className="text-sm font-medium tracking-wide">AxisParty</span>
        </div>
        <NameField name={name} onName={onName} />
      </div>

      <section className="flex flex-col items-center px-6 pt-10 pb-8 text-center">
        <div className="mb-4 text-5xl">🎬</div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Watch together. <span style={{ color: ACCENT }}>In real-time.</span>
        </h1>
        <p className="mt-3 max-w-xl text-sm text-zinc-400">
          Spin up a shared virtual browser, hand out the link, and watch (or browse) the same thing
          with friends. Chat included.
        </p>

        <div className="mt-7 flex w-full max-w-xl flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => setShowCreate(true)}
            className="flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:brightness-110"
            style={{ background: ACCENT }}
          >
            <Plus className="h-4 w-4" />
            Create a room
          </button>
          <div className="flex h-11 w-full max-w-xs items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder="Room ID"
              className="flex-1 bg-transparent px-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
            />
            <button
              onClick={() => joinId.trim() && onJoin(joinId.trim())}
              disabled={!joinId.trim()}
              className="rounded-full bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-zinc-200 disabled:opacity-40 hover:bg-white/[0.12]"
            >
              Join
            </button>
          </div>
        </div>
      </section>

      {showCreate && (
        <div className="mx-auto mb-6 w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Room name">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`${name}'s room`}
                className="w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:bg-white/[0.06]"
              />
            </Field>
            <Field label="Starting URL">
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 focus-within:bg-white/[0.06]">
                <Globe className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-zinc-100 outline-none"
                />
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={creating}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:brightness-110"
              style={{ background: ACCENT }}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create & join
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-white/[0.04] bg-zinc-950/30 px-8 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-200">Public Rooms</h2>
            <span className="text-xs text-zinc-500">{rooms.length} active</span>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/[0.06] bg-white/[0.01] py-12 text-center">
              <Tv className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-300">No rooms yet</p>
              <p className="text-xs text-zinc-500">Be the first — create one above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rooms.map((r) => <RoomCard key={r.id} room={r} onJoin={() => onJoin(r.id)} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function NameField({ name, onName }: { name: string; onName: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  useEffect(() => setVal(name), [name]);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-1 pr-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
      >
        <Avatar name={name} size={26} />
        <span>{name}</span>
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value.slice(0, 24))}
      onBlur={() => { onName(val.trim() || guestName()); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-9 rounded-full border border-white/[0.16] bg-white/[0.06] px-3 text-xs text-zinc-100 outline-none"
    />
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      style={{ background: colorFor(name), width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase text-white"
    >
      {initials(name)}
    </div>
  );
}

function RoomCard({ room, onJoin }: { room: Room; onJoin: () => void }) {
  const live = room.participants?.length || 0;
  return (
    <button
      onClick={onJoin}
      className="group flex flex-col items-stretch overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] text-left transition hover:border-white/[0.16] hover:bg-white/[0.04]"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-950">
        <Tv className="h-12 w-12 text-white/10 transition group-hover:scale-110" />
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          <Users className="h-3 w-3" /> {live}
        </span>
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="truncate text-sm font-semibold text-zinc-50">{room.title}</p>
        <p className="truncate text-[11px] text-zinc-500">{room.startUrl}</p>
        <div className="mt-2 flex items-center gap-2">
          <Avatar name={room.owner} size={20} />
          <p className="text-[11px] text-zinc-400">{room.owner}</p>
          <span className="ml-auto text-[10px] text-zinc-600">{timeAgo(room.createdAt)}</span>
        </div>
      </div>
    </button>
  );
}

function timeAgo(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function RoomView({ roomId, name, onLeave }: { roomId: string; name: string; onLeave: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [meta, setMeta] = useState<MetaPayload | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "closed" | "error">("connecting");
  const [statusText, setStatusText] = useState("Connecting…");
  const [navUrl, setNavUrl] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"chat" | "people">("chat");
  const lastFrameUrl = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback((m: Record<string, any>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(m)); } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    (async () => {
      try {
        const tr = await fetch(`/api/vms/sessions/${roomId}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name }),
        });
        const tj = await tr.json();
        if (!tr.ok) { setStatus("error"); setStatusText(tj?.error || "Token failed"); return; }
        if (cancelled) return;

        ws = new WebSocket(tj.wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => { setStatus("live"); setStatusText("Connected"); };
        ws.onerror = () => { setStatus("error"); setStatusText("Stream error"); };
        ws.onclose = () => { setStatus("closed"); setStatusText("Disconnected"); };

        ws.onmessage = (e) => {
          if (typeof e.data === "string") {
            try {
              const msg = JSON.parse(e.data);
              if (msg.t === "meta") {
                setMeta(msg);
                setParticipants(msg.participants || []);
                setMessages(msg.history || []);
                setNavUrl(msg.url || "");
              } else if (msg.t === "chat") {
                setMessages((arr) => [...arr, msg.msg]);
              } else if (msg.t === "presence") {
                setParticipants(msg.participants || []);
              } else if (msg.t === "closed") {
                setStatus("closed"); setStatusText(msg.reason || "Closed");
              }
            } catch {}
            return;
          }
          const buf = e.data as ArrayBuffer;
          const blob = new Blob([buf], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const c = canvasRef.current;
            if (c) {
              if (c.width !== img.width) c.width = img.width;
              if (c.height !== img.height) c.height = img.height;
              const ctx = c.getContext("2d");
              if (ctx) ctx.drawImage(img, 0, 0);
            }
            if (lastFrameUrl.current) URL.revokeObjectURL(lastFrameUrl.current);
            lastFrameUrl.current = url;
          };
          img.onerror = () => URL.revokeObjectURL(url);
          img.src = url;
        };

        const ping = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping" }));
        }, 15000);
        ws.addEventListener("close", () => clearInterval(ping));
      } catch (e: any) {
        if (!cancelled) { setStatus("error"); setStatusText(e?.message || "Connect failed"); }
      }
    })();

    return () => {
      cancelled = true;
      try { ws?.close(); } catch {}
      if (lastFrameUrl.current) URL.revokeObjectURL(lastFrameUrl.current);
      lastFrameUrl.current = null;
    };
  }, [roomId, name]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const mapCoords = useCallback((e: { clientX: number; clientY: number }) => {
    const c = canvasRef.current;
    if (!c || !meta) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * meta.width;
    const y = ((e.clientY - r.top) / r.height) * meta.height;
    return { x, y };
  }, [meta]);

  const sendChat = () => {
    const t = chatInput.trim();
    if (!t) return;
    send({ t: "chat", text: t });
    setChatInput("");
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    send({ t: "scroll", dy: e.deltaY });
  }, [send]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => onWheel(e);
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [onWheel]);

  const copyId = async () => {
    try { await navigator.clipboard.writeText(roomId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const statusBadge = useMemo(() => {
    if (status === "live") return { bg: "bg-emerald-500", dot: "bg-white" };
    if (status === "connecting") return { bg: "bg-amber-500", dot: "bg-white" };
    if (status === "error") return { bg: "bg-red-500", dot: "bg-white" };
    return { bg: "bg-zinc-500", dot: "bg-white" };
  }, [status]);

  return (
    <div className="flex h-full w-full flex-col bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-white/[0.05] bg-zinc-950/60 px-4 py-2.5">
        <button
          onClick={onLeave}
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
          aria-label="Back to lobby"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <div className="text-xl">🎬</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-50">{meta?.title || "Room"}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className={`flex h-1.5 w-1.5 rounded-full ${statusBadge.bg}`} />
              <span>{statusText}</span>
              {meta?.owner && <span className="text-zinc-600">·</span>}
              {meta?.owner && <span>hosted by <span className="text-zinc-400">{meta.owner}</span></span>}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={copyId}
            className="flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 text-[11px] text-zinc-300 hover:bg-white/[0.06]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="font-mono">{copied ? "Copied" : roomId.slice(0, 12)}</span>
          </button>
          <button
            onClick={onLeave}
            className="flex h-9 items-center gap-1.5 rounded-full bg-red-500/15 px-3 text-xs font-medium text-red-300 hover:bg-red-500/25"
          >
            <LogOut className="h-3.5 w-3.5" />
            Leave
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-white/[0.05] bg-zinc-950/40 px-4 py-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5">
              <Globe className="h-3.5 w-3.5 text-zinc-500" />
              <input
                value={navUrl}
                onChange={(e) => setNavUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send({ t: "navigate", url: navUrl }); }}
                className="flex-1 bg-transparent text-xs text-zinc-100 outline-none"
              />
              <button
                onClick={() => send({ t: "navigate", url: navUrl })}
                className="rounded-full bg-white/[0.08] px-3 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-white/[0.14]"
              >
                Go
              </button>
            </div>
          </div>
          <div
            ref={stageRef}
            className="relative flex flex-1 items-center justify-center overflow-hidden bg-black"
            tabIndex={0}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              const k = toKeysym(e.key);
              if (!k) return;
              e.preventDefault();
              send({ t: "keydown", k });
            }}
            onKeyUp={(e) => {
              const k = toKeysym(e.key);
              if (!k) return;
              e.preventDefault();
              send({ t: "keyup", k });
            }}
          >
            <canvas
              ref={canvasRef}
              width={meta?.width || 1280}
              height={meta?.height || 720}
              onMouseMove={(e) => { const { x, y } = mapCoords(e); send({ t: "mousemove", x, y }); }}
              onMouseDown={(e) => { e.preventDefault(); const { x, y } = mapCoords(e); send({ t: "mousemove", x, y }); send({ t: "mousedown", b: btn(e.button) }); }}
              onMouseUp={(e) => { e.preventDefault(); send({ t: "mouseup", b: btn(e.button) }); }}
              className="max-h-full max-w-full select-none"
              style={{ aspectRatio: meta ? `${meta.width}/${meta.height}` : "16/9" }}
            />
            {status !== "live" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-zinc-900/80 px-6 py-5">
                  {status === "connecting" && <Loader2 className="h-6 w-6 animate-spin text-blue-400" />}
                  <p className="text-sm text-zinc-100">{statusText}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col border-l border-white/[0.05] bg-zinc-950/60">
          <div className="flex border-b border-white/[0.05]">
            <TabButton active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageSquare className="h-3.5 w-3.5" />}>
              Chat
            </TabButton>
            <TabButton active={tab === "people"} onClick={() => setTab("people")} icon={<Users className="h-3.5 w-3.5" />}>
              People <span className="ml-1 rounded-full bg-white/[0.08] px-1.5 text-[10px]">{participants.length}</span>
            </TabButton>
          </div>

          {tab === "chat" ? (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {messages.length === 0 ? (
                  <div className="mt-8 flex flex-col items-center gap-2 text-center">
                    <MessageSquare className="h-8 w-8 text-zinc-800" />
                    <p className="text-xs text-zinc-500">No messages yet</p>
                    <p className="text-[11px] text-zinc-600">Be the first to say something.</p>
                  </div>
                ) : messages.map((m) => {
                  const mine = m.from === meta?.you.name;
                  return (
                    <div key={m.id} className={`flex items-start gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      <Avatar name={m.from} size={28} />
                      <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[11px] font-semibold" style={{ color: colorFor(m.from) }}>{m.from}</span>
                          <span className="text-[9px] text-zinc-600">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <div
                          className={`mt-0.5 rounded-2xl px-3 py-1.5 text-[13px] leading-snug break-words ${
                            mine ? "bg-blue-500/20 text-blue-50" : "bg-white/[0.06] text-zinc-100"
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); sendChat(); }}
                className="flex items-center gap-2 border-t border-white/[0.05] p-3"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message…"
                  className="flex-1 rounded-full bg-white/[0.04] px-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:bg-white/[0.06]"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || status !== "live"}
                  style={{ background: ACCENT }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40 hover:brightness-110"
                  aria-label="Send"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {participants.length === 0 ? (
                <p className="mt-8 text-center text-xs text-zinc-600">Nobody here yet.</p>
              ) : (
                <ul className="space-y-1">
                  {participants.map((p) => {
                    const me = p.pid === meta?.you.pid;
                    const host = p.name === meta?.owner;
                    return (
                      <li
                        key={p.pid}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-white/[0.03]"
                      >
                        <Avatar name={p.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-100">
                            {p.name} {me && <span className="text-[10px] text-zinc-500">(you)</span>}
                          </p>
                          <p className="text-[10px] text-zinc-500">joined {timeAgo(p.joinedAt)}</p>
                        </div>
                        {host && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                            host
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 py-3 text-xs font-medium transition ${
        active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {icon}
      {children}
      {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full" style={{ background: ACCENT }} />}
    </button>
  );
}

function btn(b: number): number {
  if (b === 0) return 1;
  if (b === 1) return 2;
  if (b === 2) return 3;
  return 1;
}

function toKeysym(k: string): string | null {
  if (k.length === 1) {
    if (k === " ") return "space";
    return k;
  }
  const map: Record<string, string> = {
    Enter: "Return", Backspace: "BackSpace", Tab: "Tab", Escape: "Escape",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    Home: "Home", End: "End", PageUp: "Page_Up", PageDown: "Page_Down",
    Delete: "Delete", Shift: "Shift_L", Control: "Control_L", Alt: "Alt_L",
    Meta: "Super_L", CapsLock: "Caps_Lock",
    F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
    F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  };
  return map[k] || null;
}
