import { fetchWithTimeout, formatDeezerPath } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const queries = url.searchParams.get("queries");

  if (!path) {
    return Response.json({ error: '"path" parameter is required' }, { status: 400 });
  }

  const formattedPath = formatDeezerPath(path);
  if (!formattedPath) {
    return Response.json({ error: 'Invalid "path" format' }, { status: 400 });
  }

  const queryParams = queries ? `&${queries}` : "";
  const targetUrl = `https://api.deezer.com/${formattedPath}?output=json${queryParams}`;

  try {
    const response = await fetchWithTimeout(targetUrl, {}, 8_000);
    if (!response.ok) throw new Error(`Deezer API returned status ${response.status}`);
    return Response.json(await response.json());
  } catch (error) {
    const e = error as { name?: string; message?: string };
    if (e?.name === "AbortError") {
      return Response.json(
        { error: "Request timeout - Deezer API took too long." },
        { status: 408 },
      );
    }
    console.error("Deezer proxy error:", e?.message);
    return Response.json({ error: "Failed to proxy request to Deezer API." }, { status: 500 });
  }
}
