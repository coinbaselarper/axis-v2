"use client";

import {
  ArrowUp,
  ChevronDown,
  Hash,
  KeyRound,
  MessageCircle,
  Monitor,
  Plus,
  Trash2,
  Users,
  Video,
  VideoOff,
  X,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Check,
  Lock,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { io, Socket } from "socket.io-client";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";



type Message = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
};

type Room = {
  id: string;
  title: string;
  messages: Array<{ id: string; sender: string; timestamp: number; ciphertext: string; iv: string }>;
  members: string[];
  owner: string;
  isPrivate: boolean;
  createdAt: number;
};

interface EncryptedPayload { ciphertext: string; iv: string; }
interface Vault { testBlob: EncryptedPayload; }
interface RoomData { key?: CryptoKey; id?: string; }
interface IncomingMessage extends EncryptedPayload { type: "chat" | "video"; sender: string; }



const socket: Socket = io();
let sbCurrentUser = "";
let sbRoomData: RoomData = {};

type SbAuthMode = "login" | "register";
type SbAuthResult = { ok: true; username: string } | { ok: false; error: string };

function sbHandleAuth(user: string, lPass: string, mode: SbAuthMode): Promise<SbAuthResult> {
  if (!user || !lPass) return Promise.resolve({ ok: false, error: "Missing fields" });
  sbCurrentUser = user;
  return new Promise<SbAuthResult>((resolve) => {
    let done = false;
    const finish = (r: SbAuthResult) => {
      if (done) return;
      done = true;
      socket.off("user-exists", onExists);
      socket.off("user-not-found", onNotFound);
      socket.off("auth-ok", onAuthOk);
      socket.off("reg-ok", onRegOk);
      socket.off("reg-fail", onRegFail);
      resolve(r);
    };
    const onExists = async (vault: Vault) => {
      if (mode === "register") {
        finish({ ok: false, error: "Username already exists." });
        return;
      }
      try {
        const masterKey = await ZK.deriveKey(lPass, user + "-master");
        await ZK.decrypt(vault.testBlob, masterKey);
        socket.emit("auth-ok", { username: user });
      } catch {
        finish({ ok: false, error: "Incorrect password." });
      }
    };
    const onNotFound = async () => {
      if (mode === "login") {
        finish({ ok: false, error: "Account not found. Switch to Register." });
        return;
      }
      try {
        const masterKey = await ZK.deriveKey(lPass, user + "-master");
        const testBlob = await ZK.encrypt("verified-" + user, masterKey);
        socket.emit("register", { username: user, testBlob });
      } catch {
        finish({ ok: false, error: "Failed to register." });
      }
    };
    const onAuthOk = ({ username }: { username: string }) => {
      sbCurrentUser = username;
      finish({ ok: true, username });
    };
    const onRegOk = () => {
      sbCurrentUser = user;
      finish({ ok: true, username: user });
    };
    const onRegFail = (reason: string) => {
      finish({ ok: false, error: reason || "Registration failed." });
    };
    socket.once("user-exists", onExists);
    socket.once("user-not-found", onNotFound);
    socket.on("auth-ok", onAuthOk);
    socket.on("reg-ok", onRegOk);
    socket.on("reg-fail", onRegFail);
    socket.emit("check-user", user);
  });
}


const ZK = {
  async deriveKey(password: string, salt: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const mat = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
      mat, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  },
  async encrypt(data: string | Uint8Array, key: CryptoKey): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv } as AesGcmParams, key, encoded as BufferSource);


    const toB64 = (buf: ArrayBuffer) => {
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };

    return { ciphertext: toB64(ct), iv: toB64(iv.buffer as ArrayBuffer) };
  },
  async decrypt(obj: EncryptedPayload, key: CryptoKey): Promise<ArrayBuffer> {
    if (!obj?.ciphertext || !obj?.iv) throw new Error("Empty payload");


    const fromB64 = (s: string) => {
      const bin = atob(s);
      const res = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        res[i] = bin.charCodeAt(i);
      }
      return res;
    };

    return crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(obj.iv) }, key, fromB64(obj.ciphertext));
  },
  async decryptText(obj: EncryptedPayload, key: CryptoKey): Promise<string> {
    return new TextDecoder().decode(await ZK.decrypt(obj, key));
  },
};



async function deriveRoomKey(roomId: string): Promise<CryptoKey> {
  return ZK.deriveKey(roomId, "room-salt-v1");
}



let sbActiveStream: MediaStream | null = null;
let sbActiveInterval: ReturnType<typeof setInterval> | null = null;

async function toggleSbStream(canvas: HTMLCanvasElement): Promise<boolean> {
  if (sbActiveStream) {
    sbActiveStream.getTracks().forEach((t) => t.stop());
    sbActiveStream = null;
    if (sbActiveInterval) { clearInterval(sbActiveInterval); sbActiveInterval = null; }
    return false;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5 } as MediaTrackConstraints,
      audio: false,
    });
    sbActiveStream = stream;
    const vid = document.createElement("video");
    vid.srcObject = stream; vid.muted = true; await vid.play();
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    sbActiveInterval = setInterval(async () => {
      if (!stream.active) { clearInterval(sbActiveInterval!); sbActiveStream = null; return; }
      canvas.width = vid.videoWidth || 1280;
      canvas.height = vid.videoHeight || 720;
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob || !sbRoomData.key) return;
        const enc = await ZK.encrypt(new Uint8Array(await blob.arrayBuffer()), sbRoomData.key);
        socket.emit("send", { ...enc, type: "video", sender: sbCurrentUser });
      }, "image/jpeg", 0.35);
    }, 500);
    stream.getVideoTracks()[0].onended = () => {
      if (sbActiveInterval) clearInterval(sbActiveInterval);
      sbActiveStream = null;
    };
    return true;
  } catch { return false; }
}



const USER_KEY = "axis.chat.user.v1";
const ACTIVE_ROOM_KEY = "axis.chat.activeRoom.v1";

function loadSavedUser() {
  try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveUser(u: string, p: string) {
  try { localStorage.setItem(USER_KEY, JSON.stringify({ username: u, password: p })); } catch {}
}



interface ChatSidebarProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}



export default function ChatSidebar({ isOpen: controlledOpen, onOpenChange, className }: ChatSidebarProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback((v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  }, [onOpenChange]);


  const [authed, setAuthed] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);


  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [memberCount, setMemberCount] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [showRoomList, setShowRoomList] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);
  const [remoteFrameSender, setRemoteFrameSender] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteStatus, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const prevMsgCount = useRef(0);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRoomSwitch = useRef<string | null>(null);

  const authUsernameRef = useRef("");
  const authPasswordRef = useRef("");
  const activeRoomIdRef = useRef("general");
  const roomKeyCache = useRef<Map<string, CryptoKey>>(new Map());

  useEffect(() => { authUsernameRef.current = authUsername; }, [authUsername]);
  useEffect(() => { authPasswordRef.current = authPassword; }, [authPassword]);
  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);



  useEffect(() => {
    if (!panelRef.current) return;
    if (isOpen) {
      gsap.fromTo(panelRef.current,
        { x: 24, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.28, ease: "power3.out" }
      );
      setUnread(0);
    }
  }, [isOpen]);



  useEffect(() => {
    if (!isOpen && messages.length > prevMsgCount.current) {
      setUnread((n) => n + (messages.length - prevMsgCount.current));
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, isOpen]);



  useEffect(() => {
    if (msgsRef.current) {
      const items = msgsRef.current.children;
      const newest = items[items.length - 1] as HTMLElement | undefined;
      if (newest) gsap.fromTo(newest, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" });
    }
  }, [messages.length]);



  useEffect(() => {
    if (showInvite && inviteInputRef.current) inviteInputRef.current.focus();
  }, [showInvite]);



  const decryptRoomMessages = useCallback(async (room: Room): Promise<Message[]> => {
    let key = roomKeyCache.current.get(room.id);
    if (!key) { key = await deriveRoomKey(room.id); roomKeyCache.current.set(room.id, key); }
    const out: Message[] = [];
    for (const m of room.messages) {
      try {
        const text = await ZK.decryptText({ ciphertext: m.ciphertext, iv: m.iv }, key);
        out.push({ id: m.id, text, sender: m.sender, timestamp: m.timestamp });
      } catch {}
    }
    return out;
  }, []);



  const activateRoom = useCallback(async (roomId: string, allRooms: Room[]) => {
    const room = allRooms.find((r) => r.id === roomId);
    if (!room) return;
    let key = roomKeyCache.current.get(roomId);
    if (!key) { key = await deriveRoomKey(roomId); roomKeyCache.current.set(roomId, key); }
    sbRoomData = { key, id: roomId };
    socket.emit("join-room", { username: sbCurrentUser, room: roomId });
    try { localStorage.setItem(ACTIVE_ROOM_KEY, roomId); } catch {}
    setActiveRoomId(roomId);
    setMessages([]);
    setRemoteFrame(null);
    setShowInvite(false);
    setInviteInput("");
    setInviteStatus(null);
    const decrypted = await decryptRoomMessages(room);
    setMessages(decrypted);
  }, [decryptRoomMessages]);



  useEffect(() => {
    const saved = loadSavedUser();
    if (!saved) return;
    setAuthUsername(saved.username);
    setAuthPassword(saved.password);
    authUsernameRef.current = saved.username;
    authPasswordRef.current = saved.password;
    setAuthLoading(true);
    sbHandleAuth(saved.username, saved.password, "login").then((r) => {
      setAuthLoading(false);
      if (r.ok) setAuthed(true);
    });
  }, []);



  useEffect(() => {
    if (!authed) return;

    socket.on("rooms", async (serverRooms: Room[]) => {
      setRooms(serverRooms);
      if (pendingRoomSwitch.current) {
        const target = pendingRoomSwitch.current;
        pendingRoomSwitch.current = null;
        await activateRoom(target, serverRooms);
        return;
      }
      const savedActive = (() => { try { return localStorage.getItem(ACTIVE_ROOM_KEY) ?? "general"; } catch { return "general"; } })();
      const target = serverRooms.find((r) => r.id === savedActive) ? savedActive : serverRooms[0]?.id ?? "general";
      await activateRoom(target, serverRooms);
    });

    socket.on("room-count", (count: number) => setMemberCount(count));

    socket.on("msg", async (data: IncomingMessage) => {
      if (!sbRoomData.key || !data?.ciphertext) return;
      try {
        if (data.type === "chat") {
          const text = await ZK.decryptText({ ciphertext: data.ciphertext, iv: data.iv }, sbRoomData.key);
          setMessages((prev) => [...prev, {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text, sender: data.sender, timestamp: Date.now(),
          }]);
        } else if (data.type === "video") {
          const buf = await ZK.decrypt({ ciphertext: data.ciphertext, iv: data.iv }, sbRoomData.key);
          const blob = new Blob([buf], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          setRemoteFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
          setRemoteFrameSender(data.sender);
          if (remoteTimer.current) clearTimeout(remoteTimer.current);
          remoteTimer.current = setTimeout(() => { setRemoteFrame(null); setRemoteFrameSender(null); }, 1500);
        }
      } catch {}
    });


    socket.on("invite-ok", ({ invitee }: { roomId: string; invitee: string }) => {
      setInviteStatus({ ok: true, msg: `${invitee} invited` });
      setInviteInput("");
      if (inviteStatusTimer.current) clearTimeout(inviteStatusTimer.current);
      inviteStatusTimer.current = setTimeout(() => setInviteStatus(null), 4000);
    });
    socket.on("invite-fail", (reason: string) => {
      setInviteStatus({ ok: false, msg: reason });
      if (inviteStatusTimer.current) clearTimeout(inviteStatusTimer.current);
      inviteStatusTimer.current = setTimeout(() => setInviteStatus(null), 4000);
    });

    socket.emit("get-rooms");

    return () => {
      socket.off("rooms"); socket.off("room-count"); socket.off("msg");
      socket.off("invite-ok"); socket.off("invite-fail");
      if (remoteTimer.current) clearTimeout(remoteTimer.current);
      if (inviteStatusTimer.current) clearTimeout(inviteStatusTimer.current);
    };
  }, [authed, activateRoom]);



  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);



  const submitAuth = async (mode: SbAuthMode) => {
    const u = authUsername.trim();
    const p = authPassword.trim();
    if (!u || !p) return;
    setAuthError("");
    setAuthLoading(true);
    const result = await sbHandleAuth(u, p, mode);
    setAuthLoading(false);
    if (result.ok) {
      setAuthed(true);
      saveUser(u, p);
    } else {
      setAuthError(result.error);
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAuth("login");
  };

  const createRoom = () => {
    const id = newRoomInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) return;
    pendingRoomSwitch.current = id;
    socket.emit("create-room", { id, title: id, username: sbCurrentUser });
    setNewRoomInput("");
    setShowNewRoom(false);
  };

  const deleteRoom = (id: string) => {
    socket.emit("delete-room", { id, username: sbCurrentUser });
  };

  const switchRoom = async (id: string) => {
    if (id === activeRoomId) return;
    setShowRoomList(false);
    await activateRoom(id, rooms);
  };

  const sendInvite = () => {
    const invitee = inviteInput.trim();
    if (!invitee) return;
    socket.emit("invite-user", { roomId: activeRoomId, invitee, username: sbCurrentUser });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !sbRoomData.key) return;
    setInput("");
    ZK.encrypt(text, sbRoomData.key)
      .then((enc) => socket.emit("send", { ...enc, type: "chat", sender: sbCurrentUser }))
      .catch(() => {});
  };

  const handleToggleStream = async () => {
    if (!canvasRef.current) return;
    const now = await toggleSbStream(canvasRef.current);
    setStreaming(now);
  };

  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const isRoomOwner = activeRoom?.owner === sbCurrentUser;



  const FloatingButton = () => (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`fixed bottom-[72px] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.10] bg-zinc-900/90 text-zinc-300 shadow-lg backdrop-blur-md transition-all hover:bg-zinc-800/90 hover:text-white hover:scale-105 active:scale-95 ${className ?? ""}`}
    >
      <MessageCircle className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-black">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );



  const authForm = (
    <div
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 font-[family-name:var(--font-geist-sans)]"
      style={{ background: "transparent", color: "var(--axis-text)" }}
    >
      <DottedGlowBackground
        className="pointer-events-none absolute inset-0 z-0"
        gap={20}
        radius={1.2}
        color="var(--axis-accent)"
        glowColor="var(--axis-accent)"
        opacity={0.22}
      />
      <div className="relative z-10 w-full">
        <div className="mb-5 text-center">
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              background: "var(--axis-glass)",
              border: "1px solid var(--axis-border)",
              color: "var(--axis-accent)",
            }}
          >
            <MessageCircle className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold tracking-tight" style={{ color: "var(--axis-accent)" }}>
            Axis Chat
          </h2>
          <p className="mt-1 text-[11px]" style={{ color: "var(--axis-text-subtle)" }}>
            End-to-end encrypted
          </p>
        </div>
        <form onSubmit={onFormSubmit} className="flex w-full flex-col gap-2.5">
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--axis-text-muted)" }}>
              Username
            </label>
            <div className="relative">
              <input
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="your_username"
                autoComplete="username"
                className="w-full rounded-lg px-3 py-2 pr-8 text-xs outline-none transition"
                style={{
                  background: "var(--axis-glass)",
                  border: "1px solid var(--axis-border)",
                  color: "var(--axis-text)",
                }}
              />
              <KeyRound
                className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--axis-text-subtle)" }}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px]" style={{ color: "var(--axis-text-muted)" }}>
              Password
            </label>
            <div className="relative">
              <input
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-lg px-3 py-2 pr-14 text-xs outline-none transition"
                style={{
                  background: "var(--axis-glass)",
                  border: "1px solid var(--axis-border)",
                  color: "var(--axis-text)",
                }}
              />
              <KeyRound
                className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: "var(--axis-text-subtle)" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 transition"
                style={{ color: "var(--axis-text-muted)" }}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {authError && (
            <p className="rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-400">
              {authError}
            </p>
          )}
          <div className="mt-0.5 grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={authLoading || !authUsername.trim() || !authPassword.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{
                background: "var(--axis-glass-2)",
                border: "1px solid var(--axis-border-strong)",
                color: "var(--axis-white)",
              }}
            >
              <LogIn className="h-3.5 w-3.5" />
              {authLoading ? "…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => submitAuth("register")}
              disabled={authLoading || !authUsername.trim() || !authPassword.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition disabled:opacity-40"
              style={{
                background: "var(--axis-glass)",
                border: "1px solid var(--axis-border)",
                color: "var(--axis-text)",
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              {authLoading ? "…" : "Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );



  return (
    <>
      <canvas ref={canvasRef} className="hidden" />

      {!isOpen && <FloatingButton />}

      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed right-4 bottom-[72px] z-50 flex flex-col overflow-hidden rounded-2xl shadow-2xl ${className ?? ""}`}
          style={{
            width: 360,
            height: "calc(100vh - 72px - 16px)",
            top: 16,
            background: "color-mix(in srgb, var(--axis-bg) 88%, transparent)",
            border: "1px solid var(--axis-border)",
            color: "var(--axis-text)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {}
          <div
            className="flex items-center justify-between px-3 py-2.5 shrink-0"
            style={{ borderBottom: "1px solid var(--axis-border)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {authed ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRoomList((v) => !v)}
                    className="flex items-center gap-1.5 min-w-0 text-left group"
                  >
                    {activeRoom?.isPrivate ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-400 transition" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 shrink-0 text-zinc-600 group-hover:text-zinc-400 transition" />
                    )}
                    <span className="truncate text-sm font-medium text-white">{activeRoom?.title ?? activeRoomId}</span>
                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform ${showRoomList ? "rotate-180" : ""}`} />
                  </button>
                  {memberCount > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-zinc-600 ml-1">
                      <Users className="h-3 w-3" />
                      <span>{memberCount}</span>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-sm font-medium text-white">Axis Chat</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {authed && (
                <>
                  {}
                  {isRoomOwner && activeRoom?.id !== "general" && (
                    <button
                      type="button"
                      onClick={() => { setShowInvite((v) => !v); setInviteStatus(null); }}
                      title="Invite someone"
                      className={`flex h-6 w-6 items-center justify-center rounded transition ${showInvite ? "bg-white/[0.10] text-white" : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"}`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleToggleStream}
                    title={streaming ? "Stop sharing" : "Share screen"}
                    className={`flex h-6 w-6 items-center justify-center rounded transition ${streaming ? "bg-red-500/20 text-red-400" : "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300"}`}
                  >
                    {streaming ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewRoom((v) => !v)}
                    className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {}
          {showInvite && authed && isRoomOwner && (
            <div className="flex items-center gap-2 border-b border-white/[0.04] bg-white/[0.02] px-3 py-2 shrink-0">
              <UserPlus className="h-3 w-3 shrink-0 text-zinc-600" />
              <input
                ref={inviteInputRef}
                value={inviteInput}
                onChange={(e) => { setInviteInput(e.target.value); setInviteStatus(null); }}
                onKeyDown={(e) => e.key === "Enter" && sendInvite()}
                placeholder="Username to invite…"
                className="flex-1 bg-transparent text-xs text-white placeholder:text-zinc-600 outline-none"
              />
              <button
                type="button"
                onClick={sendInvite}
                disabled={!inviteInput.trim()}
                className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-0.5 text-[11px] text-white transition hover:bg-white/[0.16] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="h-3 w-3" />
                Invite
              </button>
              {inviteStatus && (
                <span className={`shrink-0 text-[11px] ${inviteStatus.ok ? "text-green-400" : "text-red-400"}`}>
                  {inviteStatus.msg}
                </span>
              )}
            </div>
          )}

          {}
          {showRoomList && authed && (
            <div className="border-b border-white/[0.06] bg-black/30 shrink-0">
              {showNewRoom && (
                <div className="flex gap-1.5 px-3 py-2 border-b border-white/[0.04]">
                  <input
                    value={newRoomInput}
                    onChange={(e) => setNewRoomInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createRoom()}
                    placeholder="new-room-name"
                    className="flex-1 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none"
                  />
                  <button type="button" onClick={createRoom}
                    className="rounded-md bg-white/[0.08] px-2 text-xs text-white hover:bg-white/[0.14] transition">
                    Add
                  </button>
                </div>
              )}
              <div className="max-h-48 overflow-y-auto py-1">
                {rooms.map((room) => {
                  const isActive = room.id === activeRoomId;
                  return (
                    <div
                      key={room.id}
                      className={`group flex items-center gap-2 px-3 py-1.5 transition ${isActive ? "bg-white/[0.06] text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}
                    >
                      <button type="button" onClick={() => switchRoom(room.id)} className="flex flex-1 items-center gap-1.5 min-w-0 text-left">
                        {room.isPrivate ? (
                          <Lock className="h-3 w-3 shrink-0 opacity-50" />
                        ) : (
                          <Hash className="h-3 w-3 shrink-0 opacity-50" />
                        )}
                        <span className="truncate text-xs">{room.title}</span>
                        {room.owner === sbCurrentUser && (
                          <span className="shrink-0 text-[9px] text-zinc-600">owner</span>
                        )}
                      </button>
                      {room.id !== "general" && room.owner === sbCurrentUser && (
                        <button
                          type="button"
                          onClick={() => deleteRoom(room.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {}
          {!authed ? (
            authForm
          ) : (
            <>
              {}
              {remoteFrame && (
                <div className="relative border-b border-white/[0.06] bg-black shrink-0" style={{ height: 180 }}>
                  <div className="absolute top-1.5 left-2 flex items-center gap-1 text-[11px] text-zinc-400 z-10">
                    <Monitor className="h-3 w-3 text-green-400" />
                    <span>{remoteFrameSender}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setRemoteFrame(null); if (remoteTimer.current) clearTimeout(remoteTimer.current); }}
                    className="absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:text-zinc-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  {}
                  <img src={remoteFrame} alt="Screen share" className="h-full w-full object-contain" />
                </div>
              )}

              {}
              <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      {activeRoom?.isPrivate ? (
                        <Lock className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                      ) : (
                        <Hash className="mx-auto mb-2 h-6 w-6 text-zinc-800" />
                      )}
                      <p className="text-xs text-zinc-600">
                        No messages in {activeRoom?.isPrivate ? "🔒" : "#"}{activeRoom?.title}
                      </p>
                      {isRoomOwner && activeRoom?.id !== "general" && (
                        <p className="mt-1 text-[11px] text-zinc-700">Use the invite button to add members</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div ref={msgsRef} className="flex flex-col gap-0.5 px-3 py-3">
                    {messages.map((m, i) => {
                      const isOwn = m.sender === sbCurrentUser;
                      const prev = messages[i - 1];
                      const showSender = !prev || prev.sender !== m.sender;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isOwn ? "items-end" : "items-start"} ${showSender && i > 0 ? "mt-2.5" : ""}`}
                        >
                          {showSender && !isOwn && (
                            <span className="mb-0.5 ml-6 text-[10px] font-medium text-zinc-500">{m.sender}</span>
                          )}
                          <div className="flex items-end gap-1.5">
                            {!isOwn && showSender && (
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-medium text-zinc-400 mb-0.5">
                                {m.sender.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {!isOwn && !showSender && <div className="w-5 shrink-0" />}
                            <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-xs leading-relaxed ${isOwn ? "rounded-br-sm bg-white/[0.10] text-white" : "rounded-bl-sm bg-white/[0.05] text-zinc-200"}`}>
                              <span className="whitespace-pre-wrap break-words">{m.text}</span>
                            </div>
                          </div>
                          {showSender && (
                            <span className={`mt-0.5 text-[9px] text-zinc-700 ${isOwn ? "mr-1" : "ml-6"}`}>
                              {fmt(m.timestamp)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {}
              <div className="shrink-0 px-3 pb-3 pt-2">
                <form
                  onSubmit={sendMessage}
                  className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5"
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Message ${activeRoom?.isPrivate ? "🔒" : "#"}${activeRoom?.title ?? activeRoomId}`}
                    className="flex-1 bg-transparent py-1 text-xs text-white placeholder:text-zinc-700 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.08] text-zinc-300 transition hover:bg-white/[0.16] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                </form>
              </div>

              {}
              <div className="shrink-0 border-t border-white/[0.04] px-3 py-2 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[9px] font-semibold text-zinc-400">
                  {sbCurrentUser.charAt(0).toUpperCase()}
                </div>
                <span className="text-[11px] text-zinc-600 truncate">{sbCurrentUser}</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}