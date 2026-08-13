#!/bin/bash
# deploy-update.sh
# Использование: ./deploy-update.sh <url_apk>

set -euo pipefail

is_url() {
  [[ "$1" =~ ^https?://[^[:space:]]+$ ]]
}

APK_URL="${1:-}"

if ! is_url "$APK_URL"; then
  if [[ -n "$APK_URL" ]]; then
    echo "Параметр не является URL APK."
  fi

  while true; do
    read -r -p "Укажи URL APK: " APK_URL
    if is_url "$APK_URL"; then
      break
    fi
    echo "Некорректный URL. Используй ссылку, начинающуюся с http:// или https://."
  done
fi

UPDATES_DIR="${UPDATES_DIR:-/opt/messenger/updates}"

echo "Скачиваю APK..."
curl -fL --progress-bar "$APK_URL" -o "$UPDATES_DIR/messenger.apk"

echo "✓ Готово. APK обновлён, version.json без изменений."
