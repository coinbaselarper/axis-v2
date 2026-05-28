module.exports = {
  apps: [
    {
      name: "axisv2",
      script: "server.ts",
      interpreter: "/root/pain/node_modules/.bin/tsx",
      cwd: "/root/pain",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "wisp-server",
      script: "/root/pain/api/wisp-server-python/.venv/bin/python3",
      args: "-m wisp.server --host 0.0.0.0 --port 6001",
      interpreter: "none",
      cwd: "/root/pain/api/wisp-server-python",
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
