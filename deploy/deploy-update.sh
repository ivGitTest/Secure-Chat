#!/bin/bash
# deploy-update.sh
# Использование: ./deploy-update.sh <url_apk>

set -euo pipefail

APK_URL="${1:?Укажи URL APK}"
UPDATES_DIR="${UPDATES_DIR:-/opt/messenger/updates}"

echo "Скачиваю APK..."
curl -fL --progress-bar "$APK_URL" -o "$UPDATES_DIR/messenger.apk"

echo "✓ Готово. APK обновлён, version.json без изменений."