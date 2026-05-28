import { spawn } from "child_process";
import fs from "fs";

const YT_DLP_BIN = (() => {
  const candidates = [
    process.env.YT_DLP_PATH,
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
})();

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastCheck = 0;
let inflight: Promise<void> | null = null;

function runUpdate(): Promise<void> {
  if (!YT_DLP_BIN) return Promise.resolve();
  return new Promise((resolve) => {
    const child = spawn(YT_DLP_BIN, ["-U"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      const tail = (out + err).trim().split("\n").slice(-2).join(" | ");
      console.log(`[yt-dlp] update exit=${code}: ${tail}`);
      resolve();
    });
    child.on("error", (e) => {
      console.warn(`[yt-dlp] update spawn error: ${e.message}`);
      resolve();
    });
  });
}

export function maybeUpdateYtDlp(): Promise<void> {
  if (!YT_DLP_BIN) return Promise.resolve();
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return Promise.resolve();
  if (inflight) return inflight;
  lastCheck = Date.now();
  inflight = runUpdate().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function forceUpdateYtDlp(): Promise<void> {
  if (!YT_DLP_BIN) return Promise.resolve();
  if (inflight) return inflight;
  lastCheck = Date.now();
  inflight = runUpdate().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function isOutdatedError(error: unknown): boolean {
  const e = error as { message?: string; stderr?: string } | undefined;
  const msg = (e?.message ?? e?.stderr ?? "").toLowerCase();
  return (
    msg.includes("update yt-dlp") ||
    msg.includes("please report this issue") ||
    msg.includes("signature extraction failed") ||
    msg.includes("nsig extraction failed") ||
    msg.includes("could not find js function") ||
    msg.includes("unable to extract") ||
    msg.includes("player response")
  );
}

void maybeUpdateYtDlp();
