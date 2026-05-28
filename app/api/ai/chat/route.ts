import type { NextRequest } from "next/server";
import { getRequestSession } from "@/lib/auth";

const AI_ENDPOINT = process.env.AI_API_ENDPOINT || "https://chat.eli.gift/shop/heroin";
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type ChatBody = {
  messages: ChatMessage[];
  model: string;
  thinking?: boolean;
};

const buckets = new Map<string, { count: number; reset: number }>();

function clientId(req: NextRequest, username?: string): string {
  if (username) return `user:${username}`;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function checkRate(id: string): { ok: boolean; retryAfter: number; remaining: number; reset: number } {
  const now = Date.now();
  const bucket = buckets.get(id);
  if (!bucket || bucket.reset <= now) {
    const reset = now + RATE_WINDOW_MS;
    buckets.set(id, { count: 1, reset });
    return { ok: true, retryAfter: 0, remaining: RATE_LIMIT - 1, reset };
  }
  if (bucket.count >= RATE_LIMIT) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.reset - now) / 1000),
      remaining: 0,
      reset: bucket.reset,
    };
  }
  bucket.count++;
  return {
    ok: true,
    retryAfter: 0,
    remaining: RATE_LIMIT - bucket.count,
    reset: bucket.reset,
  };
}

export async function POST(req: NextRequest) {
  const ctx = getRequestSession(req);

  const key = process.env.AI_API_KEY ?? process.env.navyaikey ?? process.env.NAVYAI_KEY ?? "chair";
  if (!key) {
    return new Response(
      JSON.stringify({ error: "Missing AI_API_KEY in environment" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const id = clientId(req, ctx?.user.username);
  const rl = checkRate(id);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded 5 requests per minute. Try again in ${rl.retryAfter}s.`,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfter),
          "X-RateLimit-Limit": String(RATE_LIMIT),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.floor(rl.reset / 1000)),
        },
      },
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: body.model || "gpt-4o",
      messages: body.messages,
      stream: true,
      ...(body.thinking ? { reasoning_effort: "high" } : {}),
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `Upstream ${upstream.status}: ${text}` }),
      {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-RateLimit-Limit": String(RATE_LIMIT),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": String(Math.floor(rl.reset / 1000)),
    },
  });
}
