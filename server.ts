declare const require: any;
declare const process: any;

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
import { setUpIO } from "./lib/socket";
import { createDb } from "./lib/db";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const db = createDb();

app.prepare().then(() => {
  const httpServer = createServer((req: any, res: any) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: { origin: "*" },
    maxHttpBufferSize: 8 * 1024 * 1024,
  });

  setUpIO(io, db);

  const port = parseInt(process.env.PORT || "3000", 10);
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });

  const shutdown = () => { try { db.close(); } catch {} process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});
