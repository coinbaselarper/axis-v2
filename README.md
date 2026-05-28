axisv2; a superior to axisv1 :p

## Caddy

This repo now exposes an on-demand TLS ask endpoint at `/api/caddy`.

If you do not set any allowlist env vars, the endpoint allows requests so the Caddy setup works out of the box. To lock it down, set one or both of these before starting the app:

- `CADDY_ALLOWED_DOMAINS` for exact hostnames, separated by commas or spaces.
- `CADDY_ALLOWED_SUFFIXES` for suffix matches like `example.com` or `example.org`.

The included [Caddyfile](Caddyfile) is ready to copy into `/etc/caddy/Caddyfile`. If your app does not listen on port `3000`, change both the `ask` URL and `reverse_proxy` target to match your site port.

Example app startup:

```bash
pm2 start server.js --name site
pm2 save
pm2 startup
```
# axisv2
