#!/usr/bin/env bash
# Makes port 8001 behave like bad school wifi (needs: docker compose --profile slow up).
#   ./slow-wifi.sh on       slow and unreliable: 800 ms ± 400 delay, ~50 KB/s, chopped-up packets
#   ./slow-wifi.sh awful    even worse: 2 s delay, ~10 KB/s, and some connections cut halfway
#   ./slow-wifi.sh off      normal again
# Point the app at http://<laptop-ip>:8001 instead of :8000 to feel it.
set -euo pipefail
cli() { docker compose exec -T toxiproxy /toxiproxy-cli "$@"; }
clear() { for t in latency bandwidth slicer cut; do cli toxic remove -n "$t" api >/dev/null 2>&1 || true; done; }

case "${1:-}" in
  on)
    clear
    cli toxic add -n latency -t latency -a latency=800 -a jitter=400 api
    cli toxic add -n bandwidth -t bandwidth -d -a rate=50 api
    cli toxic add -n slicer -t slicer -d -a average_size=512 -a size_variation=256 -a delay=20000 api
    ;;
  awful)
    clear
    cli toxic add -n latency -t latency -a latency=2000 -a jitter=1000 api
    cli toxic add -n bandwidth -t bandwidth -d -a rate=10 api
    cli toxic add -n cut -t limit_data -d --toxicity 0.15 -a bytes=2000 api
    ;;
  off)
    clear
    ;;
  *)
    echo "usage: $0 on|awful|off" >&2
    exit 1
    ;;
esac
cli inspect api
