export const CONFIG = {
  port: parseInt(process.env.PORT || "8080", 10),
  host: process.env.HOST || "0.0.0.0",
  serviceToken: process.env.VM_SERVICE_TOKEN || "dev-shared-secret",
  sessionMax: parseInt(process.env.SESSION_MAX || "4", 10),
  sessionIdleMs: parseInt(process.env.SESSION_IDLE_MS || "600000", 10),
  frameFps: parseInt(process.env.FRAME_FPS || "12", 10),
  frameQuality: parseInt(process.env.FRAME_QUALITY || "6", 10),
  screenWidth: parseInt(process.env.SCREEN_WIDTH || "1280", 10),
  screenHeight: parseInt(process.env.SCREEN_HEIGHT || "720", 10),
  displayStart: parseInt(process.env.DISPLAY_START || "99", 10),
  chromeBin: process.env.CHROME_BIN || "/usr/bin/chromium",
  startUrl: process.env.START_URL || "https://duckduckgo.com",
};
