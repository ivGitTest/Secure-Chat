#!/bin/sh
# renew-certs.sh — Renew the Let's Encrypt certificate and reload nginx.
#
# Intended to run weekly from root's crontab:
#   0 3 * * 1 /path/to/messenger/deploy/scripts/renew-certs.sh >> /var/log/renew-certs.log 2>&1
#
# Configuration (override via environment or edit the defaults below):
#   DOMAIN      — the domain the certificate was issued for
#   DEPLOY_DIR  — absolute path to the repo's deploy/ directory
set -eu

DOMAIN="${DOMAIN:-chat.example.com}"
# Default: the deploy/ directory this script lives in (../ from scripts/)
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

LIVE_DIR="/etc/letsencrypt/live/$DOMAIN"
CERTS_DIR="$DEPLOY_DIR/certs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running certbot renew for $DOMAIN"

# Renew any certificates that are within 30 days of expiry.
# --deploy-hook only fires when a certificate was actually renewed,
# so on most weekly runs this is a no-op.
certbot renew --quiet

# Compare the live certificate with the one nginx is serving; only copy
# and reload when they differ (i.e. a renewal actually happened).
if cmp -s "$LIVE_DIR/fullchain.pem" "$CERTS_DIR/fullchain.pem"; then
    echo "Certificate unchanged — nothing to do."
    exit 0
fi

echo "Certificate renewed — copying to $CERTS_DIR and reloading nginx"
cp "$LIVE_DIR/fullchain.pem" "$CERTS_DIR/fullchain.pem"
cp "$LIVE_DIR/privkey.pem"   "$CERTS_DIR/privkey.pem"

# Reload nginx inside the compose stack without downtime.
docker compose -f "$DEPLOY_DIR/docker-compose.yml" exec nginx nginx -s reload

echo "Done."
