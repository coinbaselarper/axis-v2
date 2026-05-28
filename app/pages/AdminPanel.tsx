"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, RefreshCw, Shield, Users, Hash, ScrollText, Ban } from "lucide-react";
import { Socket } from "socket.io-client";

type OnlineUser = { username: string; muted: boolean; admin: boolean; warns: number };
type RoomInfo = {
  id: string; title: string; members: number; messages: number;
  isPrivate: boolean; locked: boolean; slowmode: number; owner: string;
};
type ModLog = { ts: number; admin: string; action: string };
type Stats = {
  totalRooms: number; totalMessages: number; online: number;
  bannedUsers: number; bannedIPs: number; muted: number; lockedRooms: number; uptime: number;
};
type PanelData = {
  onlineUsers: OnlineUser[];
  bannedUsers: string[];
  bannedIPs: string[];
  mutedUsers: string[];
  rooms: RoomInfo[];
  modLogs: ModLog[];
  stats: Stats;
};

type Tab = "stats" | "users" | "rooms" | "logs" | "bans";

function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
}

export default function AdminPanel({
  socket,
  currentUser,
  onClose,
}: {
  socket: Socket;
  currentUser: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("stats");
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    socket.emit("admin-get-panel", { username: currentUser });
  }, [socket, currentUser]);

  useEffect(() => {
    const handler = (d: PanelData) => { setData(d); setLoading(false); };
    socket.on("admin-panel-data", handler);
    refresh();
    return () => { socket.off("admin-panel-data", handler); };
  }, [socket, refresh]);

  const cmd = (command: string, args: string[], room = "general") =>
    socket.emit("admin-cmd", { cmd: command, args, username: currentUser, room });

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "stats", label: "Stats", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "users", label: "Users", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "rooms", label: "Rooms", icon: <Hash className="h-3.5 w-3.5" /> },
    { key: "logs",  label: "Logs",  icon: <ScrollText className="h-3.5 w-3.5" /> },
    { key: "bans",  label: "Bans",  icon: <Ban className="h-3.5 w-3.5" /> },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="relative flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/[0.09] shadow-2xl"
        style={{ background: "var(--axis-bg)" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-white">Admin Panel</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 border-b border-white/[0.06] px-5 py-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === t.key
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex h-full items-center justify-center text-zinc-600 text-sm">Loading…</div>
          )}

          {!loading && data && tab === "stats" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Online" value={data.stats.online} />
              <StatCard label="Rooms" value={data.stats.totalRooms} />
              <StatCard label="Messages" value={data.stats.totalMessages} />
              <StatCard label="Banned Users" value={data.stats.bannedUsers} />
              <StatCard label="Banned IPs" value={data.stats.bannedIPs} />
              <StatCard label="Muted" value={data.stats.muted} />
              <StatCard label="Locked Rooms" value={data.stats.lockedRooms} />
              <StatCard label="Uptime" value={fmtUptime(data.stats.uptime)} />
            </div>
          )}

          {!loading && data && tab === "users" && (
            <div className="flex flex-col gap-1">
              {data.onlineUsers.length === 0 && (
                <div className="text-center text-sm text-zinc-600 py-8">No users online</div>
              )}
              {data.onlineUsers.map((u) => (
                <div
                  key={u.username}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10px] font-semibold text-zinc-300">
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate text-sm text-white">{u.username}</span>
                    {u.admin && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        admin
                      </span>
                    )}
                    {u.muted && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/25">
                        muted
                      </span>
                    )}
                    {u.warns > 0 && (
                      <span className="shrink-0 text-[10px] text-yellow-500">{u.warns}w</span>
                    )}
                  </div>
                  {u.username !== currentUser && (
                    <div className="flex shrink-0 gap-1 ml-2">
                      <ActionBtn
                        label={u.muted ? "Unmute" : "Mute"}
                        danger={!u.muted}
                        onClick={() => { cmd(u.muted ? "unmute" : "mute", [u.username]); setTimeout(refresh, 300); }}
                      />
                      <ActionBtn label="Kick" danger onClick={() => { cmd("kick", [u.username]); setTimeout(refresh, 300); }} />
                      <ActionBtn label="Ban" danger onClick={() => { if (confirm(`Ban ${u.username}?`)) { cmd("ban", [u.username]); setTimeout(refresh, 300); } }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && data && tab === "rooms" && (
            <div className="flex flex-col gap-1">
              {data.rooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white">#{r.title}</span>
                      {r.locked && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-red-500/15 text-red-400 border border-red-500/25">locked</span>}
                      {r.isPrivate && <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-zinc-500/20 text-zinc-400 border border-zinc-500/25">private</span>}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      {r.members} members · {r.messages} msgs
                      {r.slowmode > 0 && ` · ${r.slowmode}s slowmode`}
                      {r.owner && ` · owner: ${r.owner}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 ml-2">
                    <ActionBtn
                      label={r.locked ? "Unlock" : "Lock"}
                      danger={!r.locked}
                      onClick={() => { cmd(r.locked ? "unlock" : "lock", [r.id]); setTimeout(refresh, 300); }}
                    />
                    <ActionBtn
                      label="Clear"
                      danger
                      onClick={() => { if (confirm(`Clear #${r.id}?`)) { cmd("clearroom", [r.id]); setTimeout(refresh, 300); } }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && data && tab === "logs" && (
            <div className="flex flex-col gap-1">
              {data.modLogs.length === 0 && (
                <div className="text-center text-sm text-zinc-600 py-8">No logs yet</div>
              )}
              {[...data.modLogs].reverse().map((l, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                  <span className="shrink-0 text-[10px] text-zinc-600 mt-0.5">
                    {new Date(l.ts).toLocaleTimeString()}
                  </span>
                  <span className="text-[11px] text-amber-400 font-medium shrink-0">{l.admin}</span>
                  <span className="text-[11px] text-zinc-300 font-mono break-all">{l.action}</span>
                </div>
              ))}
            </div>
          )}

          {!loading && data && tab === "bans" && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">Banned Users</div>
                {data.bannedUsers.length === 0 ? (
                  <div className="text-sm text-zinc-600">None</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {data.bannedUsers.map((u) => (
                      <div key={u} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        <span className="text-sm text-white">{u}</span>
                        <ActionBtn label="Unban" onClick={() => { cmd("unban", [u]); setTimeout(refresh, 300); }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">Banned IPs</div>
                {data.bannedIPs.length === 0 ? (
                  <div className="text-sm text-zinc-600">None</div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {data.bannedIPs.map((ip) => (
                      <div key={ip} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        <span className="text-sm font-mono text-zinc-300">{ip}</span>
                        <ActionBtn label="Unban IP" onClick={() => { cmd("unbanip", [ip]); setTimeout(refresh, 300); }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActionBtn({
  label,
  danger,
  onClick,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-1 text-[11px] font-medium transition ${
        danger
          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
          : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]"
      }`}
    >
      {label}
    </button>
  );
}
