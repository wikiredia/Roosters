#!/usr/bin/env bash
# Roosters+: fetch the latest code, rebuild and restart, then start Expo with a clean Metro cache.
#
# Laptop or server is decided by app/.env:
#   laptop      no COMPOSE_FILE: app/docker-compose.yml only; Expo talks to http://<ip>:<API_PORT>
#   production  COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml: Caddy + website + the API; also restarts
#               the old Roosters server (server/) when it runs behind Caddy (TLS_MODE=proxy) and reloads the
#               Caddyfile. The API is then on 127.0.0.1 only, so Expo talks to PUBLIC_URL (https://api...)
#   The same machine can be both (the laptop is the server): the mode only decides what runs and where Expo points.
#
#   ./server-restart.sh                  pull, restart, Expo
#   ./server-restart.sh --no-expo        pull and restart only
#   API_URL=http://1.2.3.4:8010 ./server-restart.sh    another address for the app
#
# Stops when something goes wrong (local changes that block the pull, Docker not running, the API not coming up).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
# The last value of KEY in an .env file (empty when the file or the key is missing)
envval() { grep -E "^$2=" "$1" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true; }
# Plain `docker compose` inside app/: it reads app/.env, so COMPOSE_FILE (production) is honoured
app_dc() { (cd "$ROOT/app" && docker compose "$@"); }

prod=""
case "$(envval app/.env COMPOSE_FILE)" in *docker-compose.prod.yml*) prod=1 ;; esac
# Where the app on the phone finds the API: through Caddy in production (the port is loopback-only there)
if [ -n "$prod" ]; then
  API_URL="${API_URL:-$(envval app/.env PUBLIC_URL)}"
fi
API_URL="${API_URL:-http://94.226.242.154:8010}"

step "git pull"
lock_before="$(git rev-parse HEAD:app/mobile/package-lock.json 2>/dev/null || true)"
# Only fast-forward: never a surprise merge on the server
git pull --ff-only
lock_after="$(git rev-parse HEAD:app/mobile/package-lock.json 2>/dev/null || true)"

if [ -n "$prod" ]; then
  # Caddy reaches the old server over this network (app/infra/Caddyfile, server/docker-compose.caddy.yml)
  docker network inspect roosters-edge >/dev/null 2>&1 || {
    step "docker network create roosters-edge"
    docker network create roosters-edge >/dev/null
  }
  if [ "$(envval server/.env TLS_MODE)" = "proxy" ]; then
    step "old Roosters server (server/, behind Caddy)"
    (cd "$ROOT/server" && docker compose up -d --build --remove-orphans)
  fi
fi

step "docker compose up --build${prod:+ (production: Caddy, website)} (migrations run when the API starts)"
app_dc up -d --build --remove-orphans

if [ -n "$prod" ]; then
  # The Caddyfile is mounted: `up` doesn't notice an edit, a reload does (no downtime)
  step "caddy reload"
  app_dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile || echo "Caddy didn't reload; check: docker compose logs caddy" >&2
fi

# Wait for the API: the same port compose publishes (API_PORT in app/.env, default 8000)
port="$(envval app/.env API_PORT)"
port="${port:-8000}"
step "waiting for the API on port $port"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1; then
    echo "API is up."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "The API didn't answer within 2 minutes. Its log:" >&2
    app_dc logs --tail 50 api >&2
    exit 1
  fi
  sleep 2
done

if [ "${1:-}" = "--no-expo" ]; then
  exit 0
fi

cd app/mobile
if [ ! -d node_modules ] || [ "$lock_before" != "$lock_after" ]; then
  step "npm ci (dependencies changed)"
  npm ci
fi

step "expo start -c (API: $API_URL)"
EXPO_PUBLIC_API_URL="$API_URL" exec npx expo start -c
