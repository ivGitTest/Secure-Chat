#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# eas-build.sh — запустить сборку APK в EAS Cloud.
#
# Перед запуском интерактивно запрашивает versionName, versionCode и changelog,
# генерирует version.json (apkUrl и releasedAt подставляются автоматически).
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

# ── Интерактивный ввод ────────────────────────────────────────────────────────
echo ""
echo "📦  Заполни данные релиза (все поля обязательны)"
echo ""

# versionName
while true; do
  read -rp "   Версия (versionName, например 2.0.6): " VERSION_NAME
  VERSION_NAME="${VERSION_NAME#"${VERSION_NAME%%[![:space:]]*}"}" # ltrim
  VERSION_NAME="${VERSION_NAME%"${VERSION_NAME##*[![:space:]]}"}" # rtrim
  if [[ -n "$VERSION_NAME" ]]; then break; fi
  echo "   ❌  Поле не может быть пустым"
done

# versionCode
while true; do
  read -rp "   Номер сборки (versionCode, целое число): " VERSION_CODE
  VERSION_CODE="${VERSION_CODE//[[:space:]]/}"
  if [[ "$VERSION_CODE" =~ ^[1-9][0-9]*$ ]]; then break; fi
  echo "   ❌  versionCode должен быть положительным целым числом"
done

# changelog
while true; do
  read -rp "   Что нового (changelog): " CHANGELOG
  CHANGELOG="${CHANGELOG#"${CHANGELOG%%[![:space:]]*}"}"
  CHANGELOG="${CHANGELOG%"${CHANGELOG##*[![:space:]]}"}"
  if [[ -n "$CHANGELOG" ]]; then break; fi
  echo "   ❌  Поле не может быть пустым"
done

# ── Генерируем version.json ───────────────────────────────────────────────────
# Значения передаются через env-переменные: Node.js сам экранирует строки
# при JSON.stringify, поэтому кавычки, переносы строк и спецсимволы безопасны.
RELEASED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

VERSION_NAME="$VERSION_NAME" \
VERSION_CODE="$VERSION_CODE" \
CHANGELOG="$CHANGELOG"       \
RELEASED_AT="$RELEASED_AT"   \
node -e "
const fs = require('fs');
const code = parseInt(process.env.VERSION_CODE, 10);
const info = {
  versionCode : code,
  versionName : process.env.VERSION_NAME,
  releasedAt  : process.env.RELEASED_AT,
  changelog   : process.env.CHANGELOG,
  apkUrl      : 'messenger.apk',
};
fs.writeFileSync('version.json', JSON.stringify(info, null, 2));
console.log('');
console.log('✅  version.json создан:');
console.log(JSON.stringify(info, null, 2));
"

# ── Запускаем EAS ─────────────────────────────────────────────────────────────
echo ""
echo "🔧  Профиль: $PROFILE"
echo ""

pnpm dlx eas-cli@latest build \
  --profile "$PROFILE" \
  --platform android \
  --message "$CHANGELOG"

echo ""
echo "✅  Сборка запущена в EAS Cloud."
echo ""
echo "Следующие шаги:"
echo "  1. Дождись завершения сборки (EAS Dashboard или письмо на email)"
echo "  2. Скачай APK из EAS Dashboard"
echo "  3. Скопируй APK и version.json в /opt/messenger/updates/"
