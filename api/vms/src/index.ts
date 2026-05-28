import express, { type Request, type Response, type NextFunction } from "express";
import http from "node:http";
import { CONFIG } from "./config.js";
import { checkServiceAuth, issueWsToken } from "./auth.js";
import { sessionManager } from "./sessions.js";
import { attachStreamWs } from "./streamer.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  if (!checkServiceAuth(req as any)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, sessions: sessionManager.list().length, max: CONFIG.sessionMax });
});

app.get("/sessions", requireServiceAuth, (req, res) => {
  const owner = (req.query.owner as string | undefined) || undefined;
  let list = sessionManager.list();
  if (owner) list = list.filter((s) => s.owner === owner);
  res.json({ sessions: list });
});

app.post("/sessions", requireServiceAuth, async (req: Request, res: Response) => {
  const body = (req.body || {}) as { owner?: string; startUrl?: string; title?: string };
  const owner = (body.owner || "").trim();
  if (!owner) { res.status(400).json({ error: "owner required" }); return; }
  try {
    const session = await sessionManager.create(owner, body.startUrl, body.title);
    res.status(201).json({ session: { ...session.meta, participants: session.listParticipants() } });
  } catch (e: any) {
    res.status(409).json({ error: e?.message || "create failed" });
  }
});

app.get("/rooms", requireServiceAuth, (_req, res) => {
  const rooms = sessionManager.list().map((m) => {
    const s = sessionManager.get(m.id);
    return { ...m, participants: s ? s.listParticipants() : [] };
  });
  res.json({ rooms });
});

app.post("/sessions/:id/token", requireServiceAuth, (req: Request, res: Response) => {
  const session = sessionManager.get(req.params.id);
  if (!session) { res.status(404).json({ error: "not found" }); return; }
  const token = issueWsToken(session.meta.id);
  res.json({
    token,
    expiresInSec: 60,
    session: { ...session.meta, participants: session.listParticipants() },
  });
});

app.delete("/sessions/:id", requireServiceAuth, (req: Request, res: Response) => {
  const body = (req.body || {}) as { owner?: string };
  const owner = (body.owner || "").trim();
  const ok = owner
    ? sessionManager.destroyOwned(owner, req.params.id)
    : sessionManager.destroy(req.params.id);
  if (!ok) { res.status(404).json({ error: "not found" }); return; }
  res.json({ ok: true });
});

const server = http.createServer(app);
attachStreamWs(server);

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`[vms] listening on ${CONFIG.host}:${CONFIG.port}`);
});

const shutdown = (sig: string) => {
  console.log(`[vms] shutdown (${sig})`);
  for (const s of sessionManager.list()) sessionManager.destroy(s.id);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref?.();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
