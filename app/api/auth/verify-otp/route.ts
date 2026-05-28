import { NextRequest, NextResponse } from "next/server";
import {
  bumpOtpAttempts,
  consumeOtp,
  createSession,
  getDb,
  getOtp,
  getUserByName,
  hashCode,
  isDevBypass,
  normalizeEmail,
  OTP_LIMITS,
  saveUser,
  validEmail,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string; code?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = normalizeEmail(body.email || "");
  const code = (body.code || "").trim();
  if (!validEmail(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: "Enter the 6-digit code" }, { status: 400 });

  const db = getDb();
  const rec = getOtp(db, email);
  if (!rec) return NextResponse.json({ error: "Request a code first" }, { status: 400 });
  if (rec.expiresAt <= Date.now() && !isDevBypass()) {
    consumeOtp(db, email);
    return NextResponse.json({ error: "Code expired — request a new one" }, { status: 400 });
  }
  if (rec.attempts >= OTP_LIMITS.MAX_ATTEMPTS && !isDevBypass()) {
    consumeOtp(db, email);
    return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
  }

  if (!isDevBypass() && hashCode(code, email) !== rec.codeHash) {
    bumpOtpAttempts(db, email, rec);
    return NextResponse.json({ error: "Incorrect code" }, { status: 400 });
  }

  const user = getUserByName(db, rec.username);
  if (!user) {
    consumeOtp(db, email);
    return NextResponse.json({ error: "User missing" }, { status: 500 });
  }

  user.emailVerifiedAt = Date.now();
  if (!user.email) user.email = email;
  saveUser(db, user);
  consumeOtp(db, email);

  const session = createSession(db, user.username);

  const res = NextResponse.json({
    ok: true,
    user: { username: user.username, email: user.email, emailVerifiedAt: user.emailVerifiedAt },
    token: session.token,
  });
  res.cookies.set("axis_session", session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
  });
  return res;
}
