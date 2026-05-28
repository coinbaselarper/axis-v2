const SERVICE_URL = process.env.VM_SERVICE_URL || "http://localhost:8080";
const SERVICE_TOKEN = process.env.VM_SERVICE_TOKEN || "dev-shared-secret";

export const VM_PUBLIC_WS_URL = process.env.VM_PUBLIC_WS_URL || "";

type Json = Record<string, any>;

async function call(method: string, path: string, body?: Json): Promise<Response> {
  return fetch(`${SERVICE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

export async function listSessions(owner: string) {
  const r = await call("GET", `/sessions?owner=${encodeURIComponent(owner)}`);
  if (!r.ok) throw new Error(`list ${r.status}`);
  return (await r.json()) as { sessions: any[] };
}

export async function createSession(owner: string, startUrl?: string, title?: string) {
  const r = await call("POST", `/sessions`, { owner, startUrl, title });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `create ${r.status}`);
  return j as { session: any };
}

export async function listRooms() {
  const r = await call("GET", `/rooms`);
  if (!r.ok) throw new Error(`rooms ${r.status}`);
  return (await r.json()) as { rooms: any[] };
}

export async function destroySession(owner: string, id: string) {
  const r = await call("DELETE", `/sessions/${encodeURIComponent(id)}`, { owner });
  if (!r.ok && r.status !== 404) throw new Error(`destroy ${r.status}`);
  return r.status === 200;
}

export async function issueWsToken(id: string) {
  const r = await call("POST", `/sessions/${encodeURIComponent(id)}/token`, {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `token ${r.status}`);
  return j as { token: string; expiresInSec: number; session: any };
}
