#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# User creation script — EXAMPLE TEMPLATE
#
# Copy this file to scripts/create-users.sh and fill in real names and PINs.
# create-users.sh is in .gitignore and will never be committed.
#
# Usage (development):
#   chmod +x scripts/create-users.sh
#   DATABASE_URL="postgresql://..." ./scripts/create-users.sh
#
# Usage (production — inside the api Docker container):
#   docker compose -f deploy/docker-compose.yml exec api \
#     sh -c 'DATABASE_URL=$DATABASE_URL node /app/dist/admin.mjs create-user --id "$1" --name "$2" --pin "$3"' \
#     -- alice Alice 123456
#
# Or use the helper function below by running:
#   docker compose -f deploy/docker-compose.yml exec api sh < scripts/create-users.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Detect environment:
#   - pnpm workspace (dev/Replit) → run via tsx, no build needed
#   - Docker container             → use pre-built /app/dist/admin.mjs
WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$WORKSPACE_ROOT/pnpm-workspace.yaml" ]; then
  RUN_ADMIN="pnpm --dir \"$WORKSPACE_ROOT\" --filter @workspace/scripts run admin --"
else
  RUN_ADMIN="node /app/dist/admin.mjs"
fi

create_user() {
  id="$1"
  name="$2"
  pin="$3"
  echo "Creating user: $id ($name)..."
  eval "$RUN_ADMIN create-user --id \"$id\" --name \"$name\" --pin \"$pin\""
}

# ─── Add your family members below ───────────────────────────────────────────

# create_user "alice"   "Alice"   "111111"
# create_user "bob"     "Bob"     "222222"
# create_user "carol"   "Carol"   "333333"

echo "Done."
