"use client";

import {
  ArrowUp,
  Hash,
  KeyRound,
  LogIn,
  MessageCircle,
  Plus,
  Trash2,
  UserPlus,
  X,
  Eye,
  EyeOff,
  Video,
  VideoOff,
  Monitor,
  Lock,
  Shield,
} from "lucide-react";
import AdminPanel from "./AdminPanel";
import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { io, Socket } from "socket.io-client";
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background";

type Message = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  kind?: "chat" | "system" | "result-ok" | "result-err";
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
let currentUser = "";
let roomData: RoomData = {};

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

export type AuthMode = "login" | "register";
export type AuthResult = { ok: true; username: string; isAdmin?: boolean } | { ok: false; error: string };

export function handleAuth(user: string, lPass: string, mode: AuthMode): Promise<AuthResult> {
  if (!user || !lPass) return Promise.resolve({ ok: false, error: "Missing fields" });
  currentUser = user;
  return new Promise<AuthResult>((resolve) => {
    let done = false;
    const finish = (r: AuthResult) => {
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
    const onAuthOk = ({ username, isAdmin }: { username: string; isAdmin?: boolean }) => {
      currentUser = username;
      finish({ ok: true, username, isAdmin });
    };
    const onRegOk = () => {
      currentUser = user;
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

async function deriveRoomKey(roomId: string): Promise<CryptoKey> {
  return ZK.deriveKey(roomId, "room-salt-v1");
}

const URL_RE = /https?:\/\/[^\s]+/gi;
function stripLinks(text: string): string {
  return text.replace(URL_RE, "[link]");
}

const USER_KEY = "axis.chat.user.v1";
const ACTIVE_ROOM_KEY = "axis.chat.activeRoom.v1";

function loadSavedUser(): { username: string; password: string } | null {
  try { const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function saveUser(u: string, p: string) {
  try { localStorage.setItem(USER_KEY, JSON.stringify({ username: u, password: p })); } catch {}
}

export default function Chat() {
  const [isRemoteFullscreen, setIsRemoteFullscreen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("general");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [, setMemberCount] = useState(0);
  const [streaming, setStreaming] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [, setInviteInput] = useState("");
  const [, setInviteStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [remoteFrame, setRemoteFrame] = useState<string | null>(null);
  const [remoteFrameSender, setRemoteFrameSender] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [rateLimitMsg, setRateLimitMsg] = useState<string | null>(null);
  const rateLimitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inviteInputRef = useRef<HTMLInputElement>(null);
  const prevCountRef = useRef(0);
  const remoteFrameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inviteStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const authUsernameRef = useRef("");
  const authPasswordRef = useRef("");
  const activeRoomIdRef = useRef("general");
  const roomKeyCache = useRef<Map<string, CryptoKey>>(new Map());
  const pendingRoomSwitch = useRef<string | null>(null);

  const activeStreamRef = useRef<MediaStream | null>(null);
  const frameRequestRef = useRef<number | null>(null);

  useEffect(() => { authUsernameRef.current = authUsername; }, [authUsername]);
  useEffect(() => { authPasswordRef.current = authPassword; }, [authPassword]);
  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);

  const decryptRoomMessages = useCallback(async (room: Room): Promise<Message[]> => {
    let key = roomKeyCache.current.get(room.id);
    if (!key) {
      key = await deriveRoomKey(room.id);
      roomKeyCache.current.set(room.id, key);
    }
    const decrypted: Message[] = [];
    for (const m of room.messages) {
      try {
        const text = await ZK.decryptText({ ciphertext: m.ciphertext, iv: m.iv }, key);
        decrypted.push({ id: m.id, text, sender: m.sender, timestamp: m.timestamp });
      } catch {}
    }
    return decrypted;
  }, []);

  const activateRoom = useCallback(async (roomId: string, allRooms: Room[]) => {
    const room = allRooms.find((r) => r.id === roomId);
    if (!room) return;

    let key = roomKeyCache.current.get(roomId);
    if (!key) {
      key = await deriveRoomKey(roomId);
      roomKeyCache.current.set(roomId, key);
    }
    roomData = { key, id: roomId };

    socket.emit("join-room", { username: currentUser, room: roomId });
    try { localStorage.setItem(ACTIVE_ROOM_KEY, roomId); } catch {}
    setActiveRoomId(roomId);
    setMessages([]);
    setRemoteFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setRemoteFrameSender(null);
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
    handleAuth(saved.username, saved.password, "login").then((r) => {
      setAuthLoading(false);
      if (r.ok) { setAuthed(true); setIsAdmin(r.isAdmin ?? false); }
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
      if (!roomData.key || !data?.ciphertext) return;
      if (data.sender === currentUser && data.type === "video") return;
      try {
        if (data.type === "chat") {
          const text = await ZK.decryptText({ ciphertext: data.ciphertext, iv: data.iv }, roomData.key);
          setMessages((prev) => [...prev, {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text, sender: data.sender, timestamp: Date.now(),
          }]);
        } else if (data.type === "video") {
          const buf = await ZK.decrypt({ ciphertext: data.ciphertext, iv: data.iv }, roomData.key);
          const blob = new Blob([buf], { type: "image/jpeg" });
          const url = URL.createObjectURL(blob);
          setRemoteFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
          setRemoteFrameSender(data.sender);
          if (remoteFrameTimer.current) clearTimeout(remoteFrameTimer.current);
          remoteFrameTimer.current = setTimeout(() => {
            setRemoteFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
            setRemoteFrameSender(null);
          }, 5000);
        }
      } catch {}
    });

    socket.on("is-admin", (val: boolean) => setIsAdmin(val));

    socket.on("cmd-result", ({ ok, msg }: { ok: boolean; msg: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `cr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: msg,
          sender: "",
          timestamp: Date.now(),
          kind: ok ? "result-ok" : "result-err",
        },
      ]);
    });

    socket.on("system-msg", ({ text }: { text: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text,
          sender: "",
          timestamp: Date.now(),
          kind: "system",
        },
      ]);
    });

    socket.on("banned", (reason: string) => {
      setAuthed(false);
      setAuthError(reason);
      try { localStorage.removeItem(USER_KEY); } catch {}
    });

    socket.on("kicked", (reason: string) => {
      setAuthed(false);
      setAuthError(reason);
      try { localStorage.removeItem(USER_KEY); } catch {}
    });

    socket.on("clear-chat", () => setMessages([]));

    socket.on("rate-limited", ({ retryAfter }: { retryAfter: number }) => {
      if (rateLimitTimer.current) clearTimeout(rateLimitTimer.current);
      setRateLimitMsg(`Rate limit reached — wait ${retryAfter}s (5 msgs/min)`);
      rateLimitTimer.current = setTimeout(() => setRateLimitMsg(null), retryAfter * 1000);
    });

    socket.on("invite-ok", ({ invitee }: { roomId: string; invitee: string }) => {
      setInviteStatus({ ok: true, msg: `${invitee} has been invited` });
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
      socket.off("rooms");
      socket.off("room-count");
      socket.off("msg");
      socket.off("is-admin");
      socket.off("cmd-result");
      socket.off("system-msg");
      socket.off("banned");
      socket.off("kicked");
      socket.off("clear-chat");
      socket.off("invite-ok");
      socket.off("invite-fail");
      socket.off("rate-limited");
      if (remoteFrameTimer.current) clearTimeout(remoteFrameTimer.current);
      if (inviteStatusTimer.current) clearTimeout(inviteStatusTimer.current);
      if (rateLimitTimer.current) clearTimeout(rateLimitTimer.current);
    };
  }, [authed, activateRoom]);

  useEffect(() => {
    if (showInvite && inviteInputRef.current) inviteInputRef.current.focus();
  }, [showInvite]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (messages.length > prevCountRef.current && messagesContainerRef.current) {
      const items = messagesContainerRef.current.children;
      const newest = items[items.length - 1] as HTMLElement | undefined;
      if (newest) gsap.fromTo(newest, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (chatListRef.current && rooms.length > 0) {
      gsap.fromTo(Array.from(chatListRef.current.children),
        { opacity: 0, x: -6 },
        { opacity: 1, x: 0, duration: 0.28, stagger: 0.04, ease: "power2.out", overwrite: "auto" }
      );
    }
  }, [rooms.length]);

  useEffect(() => {
    if (formRef.current) gsap.fromTo(formRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" });
  }, [authed]);

  const submitAuth = async (mode: AuthMode) => {
    const u = authUsername.trim();
    const p = authPassword.trim();
    if (!u || !p) return;
    setAuthError("");
    setAuthLoading(true);
    const result = await handleAuth(u, p, mode);
    setAuthLoading(false);
    if (result.ok) {
      setAuthed(true);
      setIsAdmin(result.isAdmin ?? false);
      saveUser(u, p);
    } else {
      setAuthError(result.error);
    }
  };

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitAuth("login");
  };

  const switchRoom = async (id: string) => {
    if (id === activeRoomId) return;
    await activateRoom(id, rooms);
  };

  const createRoom = () => {
    const id = newRoomInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) return;
    pendingRoomSwitch.current = id;
    socket.emit("create-room", { id, title: id, username: currentUser });
    setNewRoomInput("");
    setShowNewRoom(false);
  };

  const deleteRoom = (id: string) => {
    socket.emit("delete-room", { id, username: currentUser });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !roomData.key) return;
    setInput("");

    if (text.startsWith("?")) {
      const parts = text.slice(1).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);
      socket.emit("admin-cmd", { cmd, args, username: currentUser, room: activeRoomIdRef.current });
      return;
    }

    ZK.encrypt(text, roomData.key)
      .then((enc) => socket.emit("send", { ...enc, type: "chat", sender: currentUser }))
      .catch(() => {});
  };

  const stopStreaming = useCallback(() => {
    if (frameRequestRef.current) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    activeStreamRef.current = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => stopStreaming();
  }, [stopStreaming]);

  const handleToggleStream = async () => {
    if (streaming) {
      stopStreaming();
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false, desynchronized: true });
    if (!canvas || !ctx) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      activeStreamRef.current = stream;
      const vid = document.createElement("video");
      vid.srcObject = stream;
      vid.muted = true;
      await vid.play().catch(() => {});

      setStreaming(true);
      stream.getVideoTracks()[0].onended = () => stopStreaming();

      let lastFrameTime = 0;
      const fpsLimit = 15;
      let isProcessing = false;

      const renderLoop = (now: number) => {
        if (!activeStreamRef.current || !stream.active) return;

        const delta = now - lastFrameTime;
        if (!isProcessing && delta > 1000 / fpsLimit && vid.videoWidth > 0) {
          isProcessing = true;
          lastFrameTime = now;

          const targetW = Math.min(1280, vid.videoWidth);
          canvas.width = targetW;
          canvas.height = (targetW / vid.videoWidth) * vid.videoHeight;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "medium";
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(async (blob) => {
            if (blob && roomData.key) {
              try {
                const arrayBuffer = await blob.arrayBuffer();
                const enc = await ZK.encrypt(new Uint8Array(arrayBuffer), roomData.key);
                socket.emit("send", { ...enc, type: "video", sender: currentUser });
              } catch {}
            }
            isProcessing = false;
          }, "image/jpeg", 0.5);
        }

        frameRequestRef.current = requestAnimationFrame(renderLoop);
      };

      frameRequestRef.current = requestAnimationFrame(renderLoop);
    } catch {
      stopStreaming();
    }
  };

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  if (!authed) {
    return (
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden font-[family-name:var(--font-geist-sans)]"
        style={{ background: "var(--axis-bg)", color: "var(--axis-text)" }}
      >
        <DottedGlowBackground
          className="pointer-events-none absolute inset-0 z-0"
          gap={22}
          radius={1.4}
          color="var(--axis-accent)"
          glowColor="var(--axis-accent)"
          opacity={0.45}
        />
        <canvas ref={canvasRef} className="hidden" />
        <div className="relative z-10 w-full max-w-sm px-6">
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{
                background: "var(--axis-glass)",
                border: "1px solid var(--axis-border)",
                color: "var(--axis-accent)",
              }}
            >
              <MessageCircle className="h-6 w-6" />
            </div>
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--axis-accent)" }}
            >
              Axis Chat
            </h1>
            <p className="mt-1 text-[11px]" style={{ color: "var(--axis-text-subtle)" }}>
              End-to-end encrypted
            </p>
          </div>
          <form ref={formRef} onSubmit={onFormSubmit} className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs" style={{ color: "var(--axis-text-muted)" }}>
                Username
              </label>
              <div className="relative">
                <input
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  placeholder="your_username"
                  autoComplete="username"
                  className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm outline-none transition"
                  style={{
                    background: "var(--axis-glass)",
                    border: "1px solid var(--axis-border)",
                    color: "var(--axis-text)",
                  }}
                />
                <KeyRound
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--axis-text-subtle)" }}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs" style={{ color: "var(--axis-text-muted)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-lg px-3 py-2.5 pr-16 text-sm outline-none transition"
                  style={{
                    background: "var(--axis-glass)",
                    border: "1px solid var(--axis-border)",
                    color: "var(--axis-text)",
                  }}
                />
                <KeyRound
                  className="pointer-events-none absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--axis-text-subtle)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: "var(--axis-text-muted)" }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {authError && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{authError}</p>
            )}
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={authLoading || !authUsername.trim() || !authPassword.trim()}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "var(--axis-glass-2)",
                  border: "1px solid var(--axis-border-strong)",
                  color: "var(--axis-white)",
                }}
              >
                <LogIn className="h-4 w-4" />
                {authLoading ? "…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => submitAuth("register")}
                disabled={authLoading || !authUsername.trim() || !authPassword.trim()}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: "var(--axis-glass)",
                  border: "1px solid var(--axis-border)",
                  color: "var(--axis-text)",
                }}
              >
                <UserPlus className="h-4 w-4" />
                {authLoading ? "…" : "Register"}
              </button>
            </div>
          </form>
          <p className="mt-4 text-center text-xs" style={{ color: "var(--axis-text-subtle)" }}>
            New here? Click <span style={{ color: "var(--axis-text-muted)" }}>Register</span> instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden text-zinc-200">
      <canvas ref={canvasRef} className="hidden" />

      <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.06] bg-black/20">
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Rooms</span>
          <button
            type="button"
            onClick={() => setShowNewRoom((v) => !v)}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            {showNewRoom ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>

        {showNewRoom && (
          <div className="flex gap-1.5 px-2 py-2 border-b border-white/[0.04]">
            <input
              value={newRoomInput}
              onChange={(e) => setNewRoomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              placeholder="room-name"
              className="flex-1 min-w-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-white/20"
            />
            <button
              type="button"
              onClick={createRoom}
              className="rounded-md bg-white/[0.08] px-2 py-1.5 text-xs text-white transition hover:bg-white/[0.14]"
            >
              Add
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1.5">
          <div ref={chatListRef} className="flex flex-col px-1.5 gap-0.5">
            {rooms.map((room) => {
              const isActive = room.id === activeRoomId;
              return (
                <div
                  key={room.id}
                  className={`group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${isActive ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}
                >
                  <button
                    type="button"
                    onClick={() => switchRoom(room.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    {room.isPrivate ? (
                      <Lock className="h-3 w-3 shrink-0 opacity-50" />
                    ) : (
                      <Hash className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    )}
                    <span className="truncate text-xs">{room.title}</span>
                    {room.owner === currentUser && (
                      <span className="shrink-0 text-[9px] text-zinc-600 font-medium">owner</span>
                    )}
                  </button>
                  {room.id !== "general" && room.owner === currentUser && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteRoom(room.id); }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition hover:text-white group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-white/[0.06] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-semibold text-zinc-300">
              {currentUser.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-xs text-zinc-500">{currentUser}</span>
            {isAdmin && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25">
                admin
              </span>
            )}
          </div>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col h-full min-w-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-zinc-600" />
            <span className="text-sm font-medium text-white">{activeRoom?.title ?? activeRoomId}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-400 transition hover:bg-amber-500/10"
                title="Admin Panel"
              >
                <Shield size={14} />
                <span>Admin</span>
              </button>
            )}
            <button
              onClick={handleToggleStream}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition ${streaming ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"}`}
              title={streaming ? "Stop sharing" : "Share screen"}
            >
              {streaming ? <VideoOff size={14} /> : <Video size={14} />}
              <span>{streaming ? "Stop" : "Share"}</span>
            </button>
          </div>
        </header>

        {remoteFrame && (
          <div
            className={
              isRemoteFullscreen
                ? "fixed inset-0 z-50 flex flex-col bg-black"
                : "relative shrink-0 border-b border-white/10 bg-black/60"
            }
            style={isRemoteFullscreen ? undefined : { height: 250 }}
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Monitor className="h-3 w-3 text-green-400" />
                <span>
                  <span className="text-white font-medium">{remoteFrameSender}</span>'s screen
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsRemoteFullscreen((v) => !v)}
                  className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/10 rounded transition"
                  title={isRemoteFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    setRemoteFrame((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
                    setRemoteFrameSender(null);
                    setIsRemoteFullscreen(false);
                  }}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded transition"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center overflow-hidden bg-black">
              <img src={remoteFrame} alt="Screen share" className="h-full w-full object-contain" />
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 bg-white/[0.01]">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-zinc-600 text-sm">No messages</div>
          ) : (
            <div ref={messagesContainerRef} className="flex flex-col gap-1 p-4">
              {messages.map((m) => {
                if (m.kind === "system") {
                  return (
                    <div key={m.id} className="flex justify-center py-0.5">
                      <span className="text-[11px] text-zinc-500 bg-white/[0.03] border border-white/[0.05] px-3 py-1 rounded-full">
                        {m.text}
                      </span>
                    </div>
                  );
                }
                if (m.kind === "result-ok" || m.kind === "result-err") {
                  const isOk = m.kind === "result-ok";
                  return (
                    <div key={m.id} className="text-left">
                      <div
                        className={`inline-block px-3 py-2 rounded-xl text-xs font-mono whitespace-pre-wrap max-w-[85%] border ${
                          isOk
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                            : "bg-red-500/10 text-red-300 border-red-500/20"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={m.sender === currentUser ? "text-right" : "text-left"}>
                    <div className="text-[10px] opacity-40">{m.sender}</div>
                    <div className="inline-block px-3 py-1.5 rounded-xl bg-white/[0.05] text-sm">
                      {stripLinks(m.text)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950">
          {rateLimitMsg && (
            <div className="px-4 pt-2 pb-0">
              <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-400">
                {rateLimitMsg}
              </div>
            </div>
          )}
          <div className="p-4">
            <form onSubmit={sendMessage} className="flex gap-2 bg-white/[0.04] rounded-xl p-1 border border-white/[0.08]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isAdmin ? "Type a message or ?help for commands..." : "Type a message..."}
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              />
              <button type="submit" className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition">
                <ArrowUp size={18} />
              </button>
            </form>
          </div>
        </div>
      </main>

      {showAdmin && (
        <AdminPanel socket={socket} currentUser={currentUser} onClose={() => setShowAdmin(false)} />
      )}
    </div>
  );
}
