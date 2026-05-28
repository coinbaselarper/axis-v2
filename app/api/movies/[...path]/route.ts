const UPSTREAM =
  process.env.MOVIES_UPSTREAM ?? "https://movies.goadeddev.dpdns.org";

const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "x-forwarded-host",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "set-cookie",
  "strict-transport-security",
]);

function buildRequestHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (STRIP_REQUEST_HEADERS.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  out.set("host", new URL(UPSTREAM).host);
  return out;
}

function buildResponseHeaders(src: Headers): Headers {
  const out = new Headers();
  src.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    out.set(key, value);
  });
  out.set("access-control-allow-origin", "*");
  return out;
}

async function proxy(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST" | "HEAD" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
): Promise<Response> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${UPSTREAM}/${(path ?? []).join("/")}${url.search}`;

  const init: RequestInit = {
    method,
    headers: buildRequestHeaders(req.headers),
    redirect: "follow",
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = req.body;

    (init as RequestInit & { duplex?: "half" }).duplex = "half";
  }

  let res: Response | null = null;
  let lastErr: unknown = null;
  const maxAttempts = method === "GET" || method === "HEAD" ? 3 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      res = await fetch(target, init);
      if (res.ok || res.status === 404 || res.status < 500) break;
      lastErr = `status ${res.status}`;
    } catch (err) {
      lastErr = err;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  if (!res) {
    const msg =
      lastErr instanceof Error
        ? lastErr.message
        : typeof lastErr === "string"
          ? lastErr
          : "Upstream unreachable.";
    return new Response(`Upstream fetch failed: ${msg}`, { status: 502 });
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: buildResponseHeaders(res.headers),
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "GET");
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "POST");
}

export async function HEAD(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "HEAD");
}

export async function OPTIONS(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "OPTIONS");
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "PUT");
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "DELETE");
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, ctx, "PATCH");
}
