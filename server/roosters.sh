#!/usr/bin/env bash
# Beheer van de Roosters-server. Gebruik: ./roosters.sh <commando>
set -euo pipefail
cd "$(dirname "$0")"

dc() { docker compose "$@"; }
need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Dit commando moet als root: sudo ./roosters.sh $*" >&2
    exit 1
  fi
}
rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }

case "${1:-help}" in
  init)
    if [ -f .env ]; then echo ".env bestaat al, niets aangepast."; exit 0; fi
    read -rp "Je publieke IP (bv. 94.226.x.x): " ip
    sed -e "s/^PUBLIC_IP=.*/PUBLIC_IP=$ip/" \
        -e "s/^PUBLIC_HOST=.*/PUBLIC_HOST=$ip/" \
        -e "s/^DB_PASSWORD=.*/DB_PASSWORD=$(rand 32)/" \
        -e "s/^DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$(rand 32)/" \
        -e "s/^SECRET_KEY=.*/SECRET_KEY=$(rand 48)/" .env.example > .env
    chmod 600 .env
    echo ".env gemaakt. Bewaar SECRET_KEY goed: zonder kan een backup de agenda-links niet meer lezen."
    ;;
  up)
    dc up -d --build
    dc ps
    ;;
  down) dc down ;;
  restart) dc restart ;;
  logs) shift; dc logs -f --tail=100 "$@" ;;
  status) dc ps; dc exec -T api python -m roosters.cli status ;;
  update)
    git pull --ff-only
    dc up -d --build
    ;;
  admin-code)
    # Eenmalige code (10 minuten) om een toestel blijvend admin te maken
    need_root admin-code
    dc exec -T api python -m roosters.cli admin-code
    ;;
  gate)
    need_root gate
    dc exec -T api python -m roosters.cli gate "${2:?on of off}"
    ;;
  import-config)
    # Zet de mensen en Untis-klassen uit config.json (van de GitHub Pages-versie) in de database
    dc exec -T api python -m roosters.cli import-config < "${2:-../config.json}"
    ;;
  restore)
    need_root restore
    f="${2:?pad naar backup .zip}"
    read -rp "Dit vervangt ALLE data door de backup. Typ 'ja' om door te gaan: " ok
    [ "$ok" = "ja" ] || exit 1
    dc exec -T api python -m roosters.cli restore < "$f"
    ;;
  check-ports)
    ip="$(grep -E '^PUBLIC_IP=' .env | cut -d= -f2)"
    echo "Test of poort 80 en 443 open staan voor $ip ..."
    echo "(Van binnen je eigen netwerk lukt dit niet bij elke router; test ook via 4G op je gsm: http://$ip)"
    for p in 80 443; do
      if timeout 5 bash -c "</dev/tcp/$ip/$p" 2>/dev/null; then
        echo "  poort $p: bereikbaar"
      else
        echo "  poort $p: NIET bereikbaar - kijk je port forwarding na"
      fi
    done
    ;;
  *)
    cat <<'EOF'
Roosters-server

  ./roosters.sh init              .env aanmaken met nieuwe geheimen
  ./roosters.sh up                alles bouwen en starten
  ./roosters.sh down              alles stoppen
  ./roosters.sh logs [dienst]     logs volgen (api, worker, web, db, certbot)
  ./roosters.sh status            overzicht
  ./roosters.sh update            git pull en opnieuw starten
  sudo ./roosters.sh admin-code   code om je gsm/laptop admin te maken (10 min geldig)
  sudo ./roosters.sh gate on|off  goedkeuring verplicht aan/uit (kan ook in de app)
  ./roosters.sh import-config     Reda & Kayra uit ../config.json overnemen
  sudo ./roosters.sh restore F    backup terugzetten
  ./roosters.sh check-ports       poorten 80/443 testen
EOF
    ;;
esac
