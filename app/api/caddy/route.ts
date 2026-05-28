import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListConfig = {
  exact: Set<string>;
  suffixes: string[];
};

function parseList(value?: string): string[] {
  return (value || "")
    .split(/[\s,]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
}

function normalizeHost(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  try {
    const url = input.includes("://") ? new URL(input) : new URL(`https://${input}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function buildConfig(): ListConfig {
  return {
    exact: new Set(parseList(process.env.CADDY_ALLOWED_DOMAINS)),
    suffixes: parseList(process.env.CADDY_ALLOWED_SUFFIXES),
  };
}

function isAllowed(host: string, config: ListConfig): boolean {
  if (isLocalhost(host)) return true;

  if (config.exact.size === 0 && config.suffixes.length === 0) {
    return true;
  }

  if (config.exact.has(host)) {
    return true;
  }

  return config.suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("domain") || req.nextUrl.searchParams.get("host") || req.nextUrl.searchParams.get("name");

  if (!raw) {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  const host = normalizeHost(raw);
  if (!host) {
    return NextResponse.json({ error: "invalid domain" }, { status: 400 });
  }

  const allowed = isAllowed(host, buildConfig());
  if (!allowed) {
    return NextResponse.json({ allowed: false, domain: host }, { status: 403 });
  }

  return NextResponse.json({ allowed: true, domain: host }, { status: 200 });
}
