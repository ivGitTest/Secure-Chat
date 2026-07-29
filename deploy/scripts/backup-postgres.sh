#!/bin/sh
# backup-postgres.sh — Daily pg_dump backup with rotating retention.
#
# Intended to run daily from root's crontab:
#   0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
#
# Configuration — set in the environment, in deploy/.env, or edit defaults below.
#
#   COMPOSE_DIR   — directory containing docker-compose.yml (default: script's parent dir)
#   BACKUP_DIR    — host directory to store dumps (default: /opt/messenger/backups)
#   KEEP_DAILY    — number of daily backups to retain (default: 7)
#   KEEP_WEEKLY   — number of weekly backups to retain (default: 4)
#                   Weekly backups are taken on Sunday (day-of-week = 0).
#   TELEGRAM_BOT_TOKEN  — Telegram bot token (leave empty to skip Telegram)
#   TELEGRAM_CHAT_ID    — Telegram chat/user ID for failure alerts
#
# Backup filenames:
#   daily-YYYY-MM-DD.sql.gz   — created every day
#   weekly-YYYY-MM-DD.sql.gz  — also created on Sundays, retained separately
#
set -eu

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/opt/messenger/backups}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
DATE=$(date '+%Y-%m-%d')

log() {
    echo "[$TIMESTAMP] $*"
}

send_telegram() {
    MSG="$1"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST \
            "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
            --data-urlencode "text=${MSG}" \
            > /dev/null \
        && log "Telegram alert sent." \
        || log "WARNING: Telegram alert failed."
    fi
}

# ---------------------------------------------------------------------------
# Ensure backup directory exists
# ---------------------------------------------------------------------------

mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Run pg_dump inside the running postgres container
# ---------------------------------------------------------------------------

DAILY_FILE="${BACKUP_DIR}/daily-${DATE}.sql.gz"

log "Starting backup → $DAILY_FILE"

# pg_dump runs as the postgres superuser inside the container; output is piped
# to gzip on the host so the dump never touches the container filesystem.
if ! docker compose -f "${COMPOSE_DIR}/docker-compose.yml" exec -T postgres \
        pg_dump -U messenger -d messenger \
    | gzip -9 > "$DAILY_FILE"; then
    log "ERROR: pg_dump failed — removing partial file."
    rm -f "$DAILY_FILE"
    send_telegram "❌ [messenger] Daily Postgres backup FAILED on ${DATE}. Check /var/log/messenger-backup.log on the VPS."
    exit 1
fi

SIZE=$(du -sh "$DAILY_FILE" | cut -f1)
log "Backup complete: $DAILY_FILE ($SIZE)"

# ---------------------------------------------------------------------------
# Weekly snapshot (every Sunday, day-of-week = 0)
# ---------------------------------------------------------------------------

DOW=$(date '+%w')   # 0 = Sunday
if [ "$DOW" = "0" ]; then
    WEEKLY_FILE="${BACKUP_DIR}/weekly-${DATE}.sql.gz"
    cp "$DAILY_FILE" "$WEEKLY_FILE"
    log "Weekly snapshot saved: $WEEKLY_FILE"
fi

# ---------------------------------------------------------------------------
# Rotate: remove old daily backups (keep KEEP_DAILY most recent)
# ---------------------------------------------------------------------------

DAILY_COUNT=$(ls -1 "${BACKUP_DIR}"/daily-*.sql.gz 2>/dev/null | wc -l)
if [ "$DAILY_COUNT" -gt "$KEEP_DAILY" ]; then
    ls -1t "${BACKUP_DIR}"/daily-*.sql.gz \
        | tail -n "+$((KEEP_DAILY + 1))" \
        | while IFS= read -r OLD; do
            rm -f "$OLD"
            log "Removed old daily backup: $OLD"
        done
fi

# ---------------------------------------------------------------------------
# Rotate: remove old weekly backups (keep KEEP_WEEKLY most recent)
# ---------------------------------------------------------------------------

WEEKLY_COUNT=$(ls -1 "${BACKUP_DIR}"/weekly-*.sql.gz 2>/dev/null | wc -l)
if [ "$WEEKLY_COUNT" -gt "$KEEP_WEEKLY" ]; then
    ls -1t "${BACKUP_DIR}"/weekly-*.sql.gz \
        | tail -n "+$((KEEP_WEEKLY + 1))" \
        | while IFS= read -r OLD; do
            rm -f "$OLD"
            log "Removed old weekly backup: $OLD"
        done
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

DAILY_KEPT=$(ls -1 "${BACKUP_DIR}"/daily-*.sql.gz 2>/dev/null | wc -l)
WEEKLY_KEPT=$(ls -1 "${BACKUP_DIR}"/weekly-*.sql.gz 2>/dev/null | wc -l)
log "Retention summary: ${DAILY_KEPT} daily backup(s), ${WEEKLY_KEPT} weekly backup(s) in ${BACKUP_DIR}"
