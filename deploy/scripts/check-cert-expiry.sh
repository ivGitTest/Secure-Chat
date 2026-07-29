#!/bin/sh
# check-cert-expiry.sh — Alert when the TLS certificate is close to expiring.
#
# Intended to run daily from root's crontab:
#   0 8 * * * /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
#
# Configuration — set these in the environment or in deploy/.env, or edit
# the defaults directly below.
#
#   DOMAIN              — domain whose certificate to check
#   WARN_DAYS           — warn when fewer than this many days remain (default: 14)
#   CERT_FILE           — path to the local PEM (checked first; no network needed)
#   TELEGRAM_BOT_TOKEN  — Telegram bot token (leave empty to skip Telegram)
#   TELEGRAM_CHAT_ID    — Telegram chat/user ID to send the alert to
#   ALERT_EMAIL         — email address to send the alert to (leave empty to skip)
#                         Requires `mail` or `sendmail` to be configured on the host.
set -eu

DOMAIN="${DOMAIN:-chat.naviry.xyz}"
WARN_DAYS="${WARN_DAYS:-14}"
CERT_FILE="${CERT_FILE:-$(cd "$(dirname "$0")/.." && pwd)/certs/fullchain.pem}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

# ---------------------------------------------------------------------------
# Determine days remaining
# ---------------------------------------------------------------------------

if [ -f "$CERT_FILE" ]; then
    # Fast path: read the local certificate file directly.
    EXPIRY_DATE=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
else
    # Fallback: fetch the certificate served by the live domain.
    EXPIRY_DATE=$(echo \
        | openssl s_client -connect "${DOMAIN}:443" -servername "$DOMAIN" 2>/dev/null \
        | openssl x509 -noout -enddate \
        | cut -d= -f2)
fi

# Convert expiry date to epoch seconds (works on both Linux and BusyBox).
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null \
    || python3 -c "import datetime,sys; \
        d=sys.argv[1]; \
        print(int(datetime.datetime.strptime(d,'%b %d %H:%M:%S %Y %Z').timestamp()))" \
        "$EXPIRY_DATE")

NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Certificate for $DOMAIN expires in $DAYS_LEFT day(s) ($EXPIRY_DATE)"

if [ "$DAYS_LEFT" -ge "$WARN_DAYS" ]; then
    echo "[$TIMESTAMP] OK — no action needed."
    exit 0
fi

# ---------------------------------------------------------------------------
# Days remaining is below the threshold — send alerts
# ---------------------------------------------------------------------------

MESSAGE="⚠️ TLS certificate for ${DOMAIN} expires in ${DAYS_LEFT} day(s) (${EXPIRY_DATE}).

Run the renewal script or check certbot:
  /path/to/messenger/deploy/scripts/renew-certs.sh

Or renew manually:
  certbot renew --cert-name ${DOMAIN} --force-renewal"

echo "[$TIMESTAMP] WARNING: certificate expires in $DAYS_LEFT day(s) — sending alert(s)"

# --- Telegram ---
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    curl -s -X POST \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
        --data-urlencode "text=${MESSAGE}" \
        --data-urlencode "parse_mode=HTML" \
        > /dev/null \
    && echo "[$TIMESTAMP] Telegram alert sent." \
    || echo "[$TIMESTAMP] ERROR: Telegram alert failed."
fi

# --- Email ---
if [ -n "$ALERT_EMAIL" ]; then
    SUBJECT="[messenger] TLS certificate for ${DOMAIN} expires in ${DAYS_LEFT} day(s)"
    echo "$MESSAGE" | mail -s "$SUBJECT" "$ALERT_EMAIL" \
    && echo "[$TIMESTAMP] Email alert sent to $ALERT_EMAIL." \
    || echo "[$TIMESTAMP] ERROR: email alert failed — is 'mail' installed and configured?"
fi

# Exit with a non-zero status so cron can optionally mail the root user too.
exit 1
