#!/usr/bin/env bash
# Roosters+ on the laptop: fetch the latest code, rebuild and restart the server (app/docker-compose.yml), then
# start Expo for the phone with a clean Metro cache.
#
#   ./server-restart.sh                  pull, restart, Expo
#   ./server-restart.sh --no-expo        pull and restart only
#   API_URL=http://1.2.3.4:8010 ./server-restart.sh    another address for the app
#
# Stops when something goes wrong (local changes that block the pull, Docker not running, the API not coming up).
set -euo pipefail

API_URL="${API_URL:-http://94.226.242.154:8010}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "git pull"
lock_before="$(git rev-parse HEAD:app/mobile/package-lock.json 2>/dev/null || true)"
# Only fast-forward: never a surprise merge on the server
git pull --ff-only
lock_after="$(git rev-parse HEAD:app/mobile/package-lock.json 2>/dev/null || true)"

step "docker compose up --build (migrations run when the API starts)"
docker compose -f app/docker-compose.yml up -d --build --remove-orphans

# Wait for the API: the same port compose publishes (API_PORT in app/.env, default 8000)
port="$(grep -E '^API_PORT=' app/.env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '"'"'"' ' || true)"
port="${port:-8000}"
step "waiting for the API on port $port"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/v1/health" >/dev/null 2>&1; then
    echo "API is up."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "The API didn't answer within 2 minutes. Its log:" >&2
    docker compose -f app/docker-compose.yml logs --tail 50 api >&2
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
