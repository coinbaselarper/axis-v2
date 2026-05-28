const UPSTREAM =
  process.env.MOVIES_UPSTREAM ?? "https://movies.goadeddev.dpdns.org";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const { type, id } = await ctx.params;
    if (!/^(movie|tv)$/.test(type)) {
      return Response.json({ error: "invalid type" }, { status: 400 });
    }
    if (!/^\d+$/.test(id)) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }

    const target = `${UPSTREAM}/${type}/${id}`;
    let res: Response | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        res = await fetch(target, {
          headers: { accept: "text/html,*/*" },
          signal: ctrl.signal,
          cache: "no-store",
        });
        clearTimeout(timer);
        if (res.ok) break;
        if (res.status === 404) {
          return Response.json(
            { error: "Title not available on upstream." },
            { status: 404 },
          );
        }
        lastErr = `status ${res.status}`;
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }

    if (!res || !res.ok) {
      const msg =
        lastErr instanceof Error
          ? lastErr.message
          : typeof lastErr === "string"
            ? lastErr
            : "Upstream is unreachable. Try again in a moment.";
      return Response.json({ error: msg }, { status: 502 });
    }

    let html = "";
    try {
      html = await res.text();
    } catch (err) {
      return Response.json(
        { error: `read body failed: ${(err as Error).message}` },
        { status: 502 },
      );
    }

    const match = html.match(
      /\/stream\/[a-zA-Z0-9-]+\/[^"'\s>]+\.m3u8[^"'\s>]*/,
    );
    if (!match) {
      return Response.json(
        { error: "Stream not available for this title." },
        { status: 404 },
      );
    }

    return Response.json({ streamUrl: match[0] });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message || "Unknown server error" },
      { status: 500 },
    );
  }
}
