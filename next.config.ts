import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  serverExternalPackages: ["youtube-dl-exec"],
  async headers() {
    return [
      {
        source: "/:path*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/stream/:path*",
        destination: "/api/stream/:path*",
      },
    ];
  },
};

export default nextConfig;
