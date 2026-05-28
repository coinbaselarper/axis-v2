import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { consumeWsToken } from "./auth.js";
import { sessionManager, type Session, type ChatMessage, type Participant } from "./sessions.js";

type InMsg =
  | { t: "ping" }
  | { t: "mousemove"; x: number; y: number }
  | { t: "mousedown"; b: number }
  | { t: "mouseup"; b: number }
  | { t: "scroll"; dy: number }
  | { t: "keydown"; k: string }
  | { t: "keyup"; k: string }
  | { t: "type"; text: string }
  | { t: "navigate"; url: string }
  | { t: "chat"; text: string };

export function attachStreamWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  server.on("upgrade", (req: IncomingMessage, socket: any, head) => {
    try {
      const url = new URL(req.url || "/", "http://x");
      if (url.pathname !== "/stream") {
        socket.destroy();
        return;
      }
      const token = url.searchParams.get("token") || "";
      const name = url.searchParams.get("name") || "Guest";
      const sessionId = consumeWsToken(token);
      if (!sessionId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const session = sessionManager.get(sessionId);
      if (!session) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wireSocket(ws, session, name);
      });
    } catch {
      socket.destroy();
    }
  });
}

function wireSocket(ws: WebSocket, session: Session, name: string) {
  ws.binaryType = "nodebuffer";

  const me = session.addParticipant(name);

  sendJson(ws, {
    t: "meta",
    id: session.meta.id,
    title: session.meta.title,
    owner: session.meta.owner,
    width: session.meta.width,
    height: session.meta.height,
    url: session.meta.startUrl,
    you: { pid: me.pid, name: me.name },
    participants: session.listParticipants(),
    history: session.messages,
  });

  if (session.latestFrame) {
    try { ws.send(session.latestFrame, { binary: true }); } catch {}
  }

  const onFrame = (frame: Buffer) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if ((ws as any).bufferedAmount > 4 * 1024 * 1024) return;
    try { ws.send(frame, { binary: true }); } catch {}
  };
  const onChat = (msg: ChatMessage) => sendJson(ws, { t: "chat", msg });
  const onPresence = (list: Participant[]) => sendJson(ws, { t: "presence", participants: list });
  const onClosed = (reason: string) => {
    sendJson(ws, { t: "closed", reason });
    try { ws.close(1011, reason); } catch {}
  };
  session.on("frame", onFrame);
  session.on("chat", onChat);
  session.on("presence", onPresence);
  session.on("closed", onClosed);

  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    let msg: InMsg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    handleInput(session, msg, me);
  });

  const cleanup = () => {
    session.off("frame", onFrame);
    session.off("chat", onChat);
    session.off("presence", onPresence);
    session.off("closed", onClosed);
    session.removeParticipant(me.pid);
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

function sendJson(ws: WebSocket, obj: any) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch {}
}

function handleInput(session: Session, msg: InMsg, me: Participant) {
  switch (msg.t) {
    case "ping": return;
    case "mousemove": session.sendMouseMove(msg.x, msg.y); return;
    case "mousedown": session.sendMouseDown(msg.b); return;
    case "mouseup": session.sendMouseUp(msg.b); return;
    case "scroll": session.sendScroll(msg.dy); return;
    case "keydown": session.sendKey(msg.k, true); return;
    case "keyup": session.sendKey(msg.k, false); return;
    case "type": session.sendType(msg.text); return;
    case "navigate": session.sendNavigate(msg.url); return;
    case "chat": session.postMessage(me.name, msg.text); return;
  }
}
