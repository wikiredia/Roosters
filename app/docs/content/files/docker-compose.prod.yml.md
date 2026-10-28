---
updated: 2026-10-28T09:00:00Z
---

**Production on the server**, layered on top of `docker-compose.yml`: `docker compose -f docker-compose.yml -f
docker-compose.prod.yml up -d --build --remove-orphans`, or `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml`
in the server's `.env` so plain `docker compose` does it. The whole procedure (DNS, ports, `.env`, checks) is the
release guide, step 1.

Caddy (`infra/Caddyfile`) is the only thing on ports 80/443 and serves four addresses: `roostersplus.be` (the
website, service `site`), `www.` (redirect), `api.roostersplus.be` (`/api/v1/*` → `api`, the rest → the old
Roosters server from `server/`) and `temp.roostersplus.be` (the old server). The old server is reached over the
external Docker network `roosters-edge` (create it once: `docker network create roosters-edge`), where
`server/docker-compose.caddy.yml` gives its Apache the name `roosters-v1`. Only `caddy` joins that network, so the
two projects' services (both have an `api`) never see each other's names.

Never run `server-restart.sh` here: it uses `docker-compose.yml` alone, and `--remove-orphans` would stop Caddy.

## `migrate`, `worker`

Only the real SMTP settings (`SMTP_HOST` is required in `.env`) instead of Mailpit.

## `api`

No `--reload`, real SMTP, and published on `127.0.0.1` only (`ports: !override`, Compose 2.24.4+): the world goes
through Caddy, which also guarantees an honest `X-Forwarded-For` for the rate limits.

## `admin`

No `--reload`, real SMTP. Still loopback only, never in Caddy.

## `mailpit`

Moved to profile `dev`: not started in production.

## `site`

roostersplus.be: stock `httpd:2.4` serving `site/` (mounted read-only, so an edit is live at once) with
`infra/site-httpd.conf`, on port 8080 inside Docker only. Runs as www-data (33), read-only, no capabilities.

## `caddy`

`caddy:2` on 80/443 TCP and 443 UDP (HTTP/3), config `infra/Caddyfile`. Certificates live in the `caddy_data`
volume: keep it (Let's Encrypt rate-limits new certificates). Reload after editing the Caddyfile:
`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
