import crypto from "crypto";
import { createDb, type Db } from "./db";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const OTP_TTL_MS = 1000 * 60 * 10;
const OTP_MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_MS = 1000 * 30;

export type UserRecord = {
  username: string;
  email?: string;
  emailLower?: string;
  emailVerifiedAt?: number;
  testBlob?: { ciphertext: string; iv: string };
  createdAt: number;
};

export type SessionRecord = {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
};

export type OtpRecord = {
  email: string;
  username: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
};

let sharedDb: Db | null = null;
export function getDb(): Db {
  if (!sharedDb) sharedDb = createDb();
  return sharedDb;
}

export const userKey = (u: string) => `user:${u}`;
export const emailKey = (e: string) => `email:${e.toLowerCase()}`;
export const sessionKey = (t: string) => `session:${t}`;
export const otpKey = (e: string) => `otp:${e.toLowerCase()}`;

export function normalizeEmail(e: string): string {
  return (e || "").trim().toLowerCase();
}

export function validEmail(e: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(e);
}

export function validUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{2,32}$/.test(u);
}

export function generateOtp(): string {
  const n = crypto.randomInt(0, 1000000);
  return n.toString().padStart(6, "0");
}

export function hashCode(code: string, email: string): string {
  return crypto.createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function getUserByEmail(db: Db, email: string): UserRecord | undefined {
  const username = db.get(emailKey(email)) as string | undefined;
  if (!username) return undefined;
  return db.get(userKey(username)) as UserRecord | undefined;
}

export function getUserByName(db: Db, username: string): UserRecord | undefined {
  return db.get(userKey(username)) as UserRecord | undefined;
}

export function saveUser(db: Db, user: UserRecord) {
  db.set(userKey(user.username), user);
  if (user.email) db.set(emailKey(user.email), user.username);
}

export function createSession(db: Db, username: string): SessionRecord {
  const token = randomToken();
  const now = Date.now();
  const rec: SessionRecord = {
    token,
    username,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
  db.set(sessionKey(token), rec);
  return rec;
}

export function getSession(db: Db, token: string | undefined): SessionRecord | undefined {
  if (!token) return undefined;
  const rec = db.get(sessionKey(token)) as SessionRecord | undefined;
  if (!rec) return undefined;
  if (rec.expiresAt <= Date.now()) {
    if (db.del) db.del(sessionKey(token));
    return undefined;
  }
  return rec;
}

export function destroySession(db: Db, token: string) {
  if (db.del) db.del(sessionKey(token));
  else db.set(sessionKey(token), null);
}

export function setOtp(db: Db, email: string, username: string, code: string) {
  const now = Date.now();
  const rec: OtpRecord = {
    email: normalizeEmail(email),
    username,
    codeHash: hashCode(code, email),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: now,
  };
  db.set(otpKey(email), rec);
}

export function getOtp(db: Db, email: string): OtpRecord | undefined {
  return db.get(otpKey(email)) as OtpRecord | undefined;
}

export function consumeOtp(db: Db, email: string) {
  if (db.del) db.del(otpKey(email));
  else db.set(otpKey(email), null);
}

export function bumpOtpAttempts(db: Db, email: string, rec: OtpRecord) {
  rec.attempts += 1;
  db.set(otpKey(email), rec);
}

export function canResend(rec: OtpRecord | undefined): { ok: boolean; retryAfter: number } {
  if (!rec) return { ok: true, retryAfter: 0 };
  const remaining = rec.lastSentAt + SEND_COOLDOWN_MS - Date.now();
  if (remaining > 0) return { ok: false, retryAfter: Math.ceil(remaining / 1000) };
  return { ok: true, retryAfter: 0 };
}

export const OTP_LIMITS = { TTL_MS: OTP_TTL_MS, MAX_ATTEMPTS: OTP_MAX_ATTEMPTS, COOLDOWN_MS: SEND_COOLDOWN_MS };

export function isDevBypass(): boolean {
  if (process.env.DEV_BYPASS_OTP === "true") return true;
  if (process.env.DEV_BYPASS_OTP === "false") return false;
  return !process.env.RESEND_API_KEY;
}

export async function sendOtpEmail(email: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Axis <onboarding@resend.dev>";
  if (isDevBypass() || !key) {
    console.warn("[auth] dev bypass: not sending email. code for", email, "=", code);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Your Axis code: ${code}`,
      html: renderOtpHtml(code),
      text: `Your Axis verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend failed (${res.status}): ${body}`);
  }
}

function renderOtpHtml(code: string): string {
  return `<!doctype html><html><body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0b0d;padding:32px;color:#e4e4e7"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:480px;margin:0 auto;background:#18181b;border:1px solid #27272a;border-radius:14px;padding:32px"><tr><td><h1 style="margin:0 0 8px;font-size:20px;color:#fafafa">Sign in to Axis</h1><p style="margin:0 0 24px;color:#a1a1aa;font-size:14px">Enter this 6-digit code to continue. It expires in 10 minutes.</p><div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:36px;letter-spacing:14px;font-weight:600;color:#fafafa;background:#0b0b0d;border:1px solid #27272a;border-radius:10px;padding:18px 0;text-align:center">${code}</div><p style="margin:24px 0 0;color:#71717a;font-size:12px">If you didn't request this, you can ignore the email.</p></td></tr></table></body></html>`;
}

export function getRequestSession(req: { headers: { get: (k: string) => string | null }; cookies: { get: (k: string) => { value: string } | undefined } }): { session: SessionRecord; user: UserRecord } | null {
  const db = getDb();
  const tokenFromCookie = req.cookies.get("axis_session")?.value;
  const tokenFromHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = tokenFromCookie || tokenFromHeader;
  const session = getSession(db, token);
  if (!session) return null;
  const user = getUserByName(db, session.username);
  if (!user) return null;
  return { session, user };
}
