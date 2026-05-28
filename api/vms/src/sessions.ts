import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { CONFIG } from "./config.js";

export type SessionMeta = {
  id: string;
  display: number;
  owner: string;
  title: string;
  startUrl: string;
  createdAt: number;
  lastActiveAt: number;
  width: number;
  height: number;
};

export type ChatMessage = {
  id: string;
  from: string;
  text: string;
  ts: number;
};

export type Participant = {
  pid: string;
  name: string;
  joinedAt: number;
};

const CHAT_HISTORY = 100;

export class Session extends EventEmitter {
  meta: SessionMeta;
  xvfb?: ChildProcess;
  chrome?: ChildProcess;
  ffmpeg?: ChildProcess;
  frameBuffer: Buffer[] = [];
  latestFrame: Buffer | null = null;
  jpegStream: Buffer = Buffer.alloc(0);
  closed = false;
  messages: ChatMessage[] = [];
  participants = new Map<string, Participant>();

  constructor(meta: SessionMeta) {
    super();
    this.meta = meta;
  }

  get display(): string { return `:${this.meta.display}`; }

  addParticipant(name: string): Participant {
    const pid = crypto.randomBytes(6).toString("hex");
    const p: Participant = { pid, name: cleanName(name), joinedAt: Date.now() };
    this.participants.set(pid, p);
    this.emit("presence", this.listParticipants());
    return p;
  }

  removeParticipant(pid: string) {
    if (this.participants.delete(pid)) {
      this.emit("presence", this.listParticipants());
    }
  }

  listParticipants(): Participant[] {
    return Array.from(this.participants.values());
  }

  postMessage(from: string, text: string): ChatMessage | null {
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed) return null;
    const msg: ChatMessage = {
      id: crypto.randomBytes(8).toString("hex"),
      from: cleanName(from),
      text: trimmed,
      ts: Date.now(),
    };
    this.messages.push(msg);
    if (this.messages.length > CHAT_HISTORY) this.messages.splice(0, this.messages.length - CHAT_HISTORY);
    this.emit("chat", msg);
    this.touch();
    return msg;
  }

  async start() {
    await this.launchXvfb();
    await wait(500);
    this.launchChrome();
    await wait(1500);
    this.launchFfmpeg();
  }

  private launchXvfb() {
    return new Promise<void>((resolve, reject) => {
      const args = [
        this.display,
        "-screen", "0", `${this.meta.width}x${this.meta.height}x24`,
        "-nolisten", "tcp",
        "+extension", "RANDR",
        "-ac",
      ];
      const p = spawn("Xvfb", args, { stdio: ["ignore", "pipe", "pipe"] });
      this.xvfb = p;
      p.on("error", reject);
      p.on("exit", (code) => {
        if (!this.closed) {
          console.error(`[session ${this.meta.id}] Xvfb exited code=${code}`);
          this.stop("xvfb-exit");
        }
      });
      setTimeout(resolve, 250);
    });
  }

  private launchChrome() {
    const args = [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-infobars",
      "--disable-features=Translate,IsolateOrigins,site-per-process",
      "--window-position=0,0",
      `--window-size=${this.meta.width},${this.meta.height}`,
      `--user-data-dir=/tmp/chrome-${this.meta.id}`,
      "--start-maximized",
      this.meta.startUrl,
    ];
    const p = spawn(CONFIG.chromeBin, args, {
      env: { ...process.env, DISPLAY: this.display },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.chrome = p;
    p.on("exit", (code) => {
      if (!this.closed) {
        console.error(`[session ${this.meta.id}] chrome exited code=${code}`);
        this.stop("chrome-exit");
      }
    });
    p.stderr?.on("data", (d) => {
      const s = d.toString();
      if (s.includes("FATAL") || s.includes("Error")) {
        console.error(`[session ${this.meta.id}] chrome:`, s.trim().slice(0, 200));
      }
    });
  }

  private launchFfmpeg() {
    const args = [
      "-loglevel", "error",
      "-f", "x11grab",
      "-framerate", String(CONFIG.frameFps),
      "-video_size", `${this.meta.width}x${this.meta.height}`,
      "-i", this.display,
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-q:v", String(CONFIG.frameQuality),
      "-",
    ];
    const p = spawn("ffmpeg", args, {
      env: { ...process.env, DISPLAY: this.display },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.ffmpeg = p;
    p.stdout?.on("data", (chunk: Buffer) => this.onMjpegChunk(chunk));
    p.stderr?.on("data", (d) => {
      const s = d.toString().trim();
      if (s) console.error(`[session ${this.meta.id}] ffmpeg:`, s.slice(0, 200));
    });
    p.on("exit", (code) => {
      if (!this.closed) {
        console.error(`[session ${this.meta.id}] ffmpeg exited code=${code}`);
        this.stop("ffmpeg-exit");
      }
    });
  }

  private onMjpegChunk(chunk: Buffer) {
    this.jpegStream = this.jpegStream.length === 0 ? chunk : Buffer.concat([this.jpegStream, chunk]);
    while (true) {
      const start = this.jpegStream.indexOf(JPEG_START);
      if (start < 0) { this.jpegStream = Buffer.alloc(0); break; }
      const end = this.jpegStream.indexOf(JPEG_END, start + 2);
      if (end < 0) {
        if (start > 0) this.jpegStream = this.jpegStream.subarray(start);
        break;
      }
      const frame = this.jpegStream.subarray(start, end + 2);
      this.jpegStream = this.jpegStream.subarray(end + 2);
      this.latestFrame = frame;
      this.emit("frame", frame);
    }
  }

  sendMouseMove(x: number, y: number) {
    safeSpawn("xdotool", ["mousemove", String(Math.round(x)), String(Math.round(y))], this.display);
    this.touch();
  }
  sendMouseDown(button: number) {
    safeSpawn("xdotool", ["mousedown", String(button)], this.display);
    this.touch();
  }
  sendMouseUp(button: number) {
    safeSpawn("xdotool", ["mouseup", String(button)], this.display);
    this.touch();
  }
  sendScroll(dy: number) {
    const button = dy < 0 ? 4 : 5;
    const ticks = Math.min(10, Math.max(1, Math.round(Math.abs(dy) / 60)));
    for (let i = 0; i < ticks; i++) {
      safeSpawn("xdotool", ["click", String(button)], this.display);
    }
    this.touch();
  }
  sendKey(keysym: string, down: boolean) {
    safeSpawn("xdotool", [down ? "keydown" : "keyup", "--", keysym], this.display);
    this.touch();
  }
  sendType(text: string) {
    if (!text) return;
    safeSpawn("xdotool", ["type", "--delay", "8", "--", text], this.display);
    this.touch();
  }
  sendNavigate(url: string) {
    if (!/^https?:\/\//i.test(url)) return;
    safeSpawn("xdotool", ["key", "ctrl+l"], this.display);
    setTimeout(() => {
      safeSpawn("xdotool", ["type", "--delay", "0", "--", url], this.display);
      setTimeout(() => safeSpawn("xdotool", ["key", "Return"], this.display), 50);
    }, 100);
    this.touch();
  }

  touch() { this.meta.lastActiveAt = Date.now(); }

  stop(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.emit("closed", reason);
    for (const p of [this.ffmpeg, this.chrome, this.xvfb]) {
      try { p?.kill("SIGTERM"); } catch {}
    }
    setTimeout(() => {
      for (const p of [this.ffmpeg, this.chrome, this.xvfb]) {
        try { if (p && !p.killed) p.kill("SIGKILL"); } catch {}
      }
    }, 1500);
  }
}

const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

function wait(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function cleanName(s: string): string {
  const t = (s || "").replace(/[^\w\-\.À-￿ ]/g, "").trim().slice(0, 24);
  return t || "Guest";
}

function safeSpawn(cmd: string, args: string[], display: string) {
  try {
    const p = spawn(cmd, args, {
      env: { ...process.env, DISPLAY: display },
      stdio: ["ignore", "ignore", "ignore"],
    });
    p.on("error", () => {});
  } catch {}
}

export class SessionManager {
  private sessions = new Map<string, Session>();
  private usedDisplays = new Set<number>();

  list(): SessionMeta[] {
    return Array.from(this.sessions.values()).map((s) => s.meta);
  }

  get(id: string): Session | undefined { return this.sessions.get(id); }

  async create(owner: string, startUrl?: string, title?: string): Promise<Session> {
    if (this.sessions.size >= CONFIG.sessionMax) {
      throw new Error(`Session limit reached (${CONFIG.sessionMax}). Stop one first.`);
    }
    const display = this.allocateDisplay();
    const id = crypto.randomBytes(8).toString("hex");
    const meta: SessionMeta = {
      id,
      display,
      owner,
      title: (title || "").trim() || `${owner}'s room`,
      startUrl: startUrl || CONFIG.startUrl,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      width: CONFIG.screenWidth,
      height: CONFIG.screenHeight,
    };
    const session = new Session(meta);
    session.once("closed", () => {
      this.sessions.delete(id);
      this.usedDisplays.delete(display);
    });
    try {
      await session.start();
    } catch (e) {
      this.usedDisplays.delete(display);
      session.stop("start-error");
      throw e;
    }
    this.sessions.set(id, session);
    return session;
  }

  destroy(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.stop("user-destroy");
    return true;
  }

  destroyOwned(owner: string, id: string): boolean {
    const s = this.sessions.get(id);
    if (!s || s.meta.owner !== owner) return false;
    s.stop("user-destroy");
    return true;
  }

  private allocateDisplay(): number {
    let d = CONFIG.displayStart;
    while (this.usedDisplays.has(d)) d++;
    this.usedDisplays.add(d);
    return d;
  }

  reapIdle() {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (now - s.meta.lastActiveAt > CONFIG.sessionIdleMs) {
        console.log(`[reaper] killing idle session ${s.meta.id}`);
        s.stop("idle");
      }
    }
  }
}

export const sessionManager = new SessionManager();
setInterval(() => sessionManager.reapIdle(), 60_000).unref?.();
