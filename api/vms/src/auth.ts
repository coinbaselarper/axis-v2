import crypto from "node:crypto";
import { CONFIG } from "./config.js";

export function checkServiceAuth(req: { headers: Record<string, any> }): boolean {
  const h = req.headers["authorization"];
  if (!h || typeof h !== "string") return false;
  const got = h.replace(/^Bearer\s+/i, "");
  try {
    const a = Buffer.from(got);
    const b = Buffer.from(CONFIG.serviceToken);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

const wsTokens = new Map<string, { sessionId: string; expiresAt: number; consumed: boolean }>();
const WS_TOKEN_TTL = 60 * 1000;

export function issueWsToken(sessionId: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  wsTokens.set(token, { sessionId, expiresAt: Date.now() + WS_TOKEN_TTL, consumed: false });
  return token;
}

export function consumeWsToken(token: string | undefined): string | null {
  if (!token) return null;
  const rec = wsTokens.get(token);
  if (!rec) return null;
  if (rec.consumed || rec.expiresAt < Date.now()) {
    wsTokens.delete(token);
    return null;
  }
  rec.consumed = true;
  wsTokens.delete(token);
  return rec.sessionId;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, rec] of wsTokens.entries()) {
    if (rec.expiresAt < now) wsTokens.delete(t);
  }
}, 30_000).unref?.();
