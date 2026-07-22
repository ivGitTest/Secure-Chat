#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations…"

attempt=0
max_attempts=15

until node /app/dist/migrate.mjs; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] Migration failed after $max_attempts attempts — aborting"
    exit 1
  fi
  echo "[entrypoint] Migration failed (attempt $attempt/$max_attempts), retrying in 3 s…"
  sleep 3
done

echo "[entrypoint] Migrations OK — starting API server on port ${PORT:-3000}…"
exec node --enable-source-maps /app/dist/index.mjs
