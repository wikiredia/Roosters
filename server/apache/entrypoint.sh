#!/bin/sh
# Start Apache en herlaadt het (graceful) zodra er een nieuw certificaat in /tls staat.
set -eu

TLS_MODE="${TLS_MODE:-letsencrypt}"
PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
export PUBLIC_HOST
RUN=/tmp/apache
mkdir -p "$RUN"

selfsigned() {
  openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=$PUBLIC_HOST" \
    -keyout "$RUN/key.pem" -out "$RUN/cert.pem" >/dev/null 2>&1
}

pick_cert() {
  if [ "$TLS_MODE" = "letsencrypt" ] && [ -s /tls/fullchain.pem ] && [ -s /tls/privkey.pem ]; then
    cp /tls/fullchain.pem "$RUN/cert.pem.new" && cp /tls/privkey.pem "$RUN/key.pem.new"
    mv "$RUN/cert.pem.new" "$RUN/cert.pem" && mv "$RUN/key.pem.new" "$RUN/key.pem"
  elif [ ! -s "$RUN/cert.pem" ]; then
    # Nog geen echt certificaat: tijdelijk zelfondertekend, zodat Apache kan starten
    selfsigned
  fi
}

ARGS=""
if [ "$TLS_MODE" != "off" ]; then
  ARGS="-D TLS"
  pick_cert
fi

if [ "$TLS_MODE" = "letsencrypt" ]; then
  (
    last=""
    while sleep 300; do
      now="$(stat -c %Y /tls/fullchain.pem 2>/dev/null || true)"
      if [ -n "$now" ] && [ "$now" != "$last" ]; then
        last="$now"
        pick_cert
        httpd -k graceful $ARGS || true
      fi
    done
  ) &
fi

exec httpd -DFOREGROUND $ARGS
