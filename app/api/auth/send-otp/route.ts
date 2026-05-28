import { NextRequest, NextResponse } from "next/server";
import {
  canResend,
  generateOtp,
  getDb,
  getOtp,
  getUserByEmail,
  getUserByName,
  normalizeEmail,
  saveUser,
  sendOtpEmail,
  setOtp,
  validEmail,
  validUsername,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string; username?: string };

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = normalizeEmail(body.email || "");
  if (!validEmail(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const db = getDb();
  const existing = getOtp(db, email);
  const limit = canResend(existing);
  if (!limit.ok) return NextResponse.json({ error: `Wait ${limit.retryAfter}s before resending.` }, { status: 429 });

  let user = getUserByEmail(db, email);
  let username = user?.username;

  if (!user) {
    const requested = (body.username || "").trim();
    if (!requested) return NextResponse.json({ error: "New email — provide a username", needsUsername: true }, { status: 400 });
    if (!validUsername(requested)) return NextResponse.json({ error: "Username must be 2-32 chars (letters, numbers, underscores)" }, { status: 400 });
    const taken = getUserByName(db, requested);
    if (taken) {
      if (taken.email && taken.email.toLowerCase() !== email) {
        return NextResponse.json({ error: "Username taken" }, { status: 409 });
      }
      taken.email = email;
      taken.emailLower = email;
      saveUser(db, taken);
      username = taken.username;
    } else {
      const fresh = { username: requested, email, emailLower: email, createdAt: Date.now() };
      saveUser(db, fresh);
      username = fresh.username;
    }
  }

  const code = generateOtp();
  setOtp(db, email, username!, code);
  try {
    await sendOtpEmail(email, code);
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to send: ${e?.message || "unknown"}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true, username });
}
