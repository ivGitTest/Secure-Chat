#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# eas-build.sh — запустить сборку APK в EAS Cloud.
# Версия, номер сборки и release notes берутся из version.json.
#
# После завершения сборки:
#   1. Скачай APK из EAS Dashboard (или через `eas build:list`)
#   2. Сам положи version.json и APK в /opt/messenger/updates/
#
# Использование:
#   ./scripts/eas-build.sh [profile]
#
# Примеры:
#   ./scripts/eas-build.sh            # profile: preview (APK)
#   ./scripts/eas-build.sh production # profile: production (AAB)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE=${1:-preview}

# Показать что собираем
node -e "
const r = require('./version.json');
console.log('');
console.log('📦  Версия : ' + r.versionName + ' (' + r.versionCode + ')');
console.log('📝  Заметки: ' + (r.changelog || '(не указаны)'));
console.log('🔧  Профиль: $PROFILE');
console.log('');
"

RELEASE_NOTES=$(node -p "require('./version.json').changelog || ''")
EAS_ARGS=(build --profile "$PROFILE" --platform android)
if [[ -n "$RELEASE_NOTES" ]]; then
  EAS_ARGS+=(--message "$RELEASE_NOTES")
fi

pnpm dlx eas-cli@latest "${EAS_ARGS[@]}"

echo ""
echo "✅  Сборка запущена в EAS Cloud."
echo ""
echo "Следующие шаги:"
echo "  1. Дождись завершения сборки (EAS Dashboard или письмо на email)"
echo "  2. Скачай APK из EAS Dashboard"
echo "  3. Скопируй APK и version.json в /opt/messenger/updates/"
