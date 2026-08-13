#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# eas-build.sh — запустить сборку APK в EAS Cloud.
#
# Перед запуском интерактивно запрашивает versionName и changelog.
# versionCode автоматически увеличивается на 1 относительно version.json.
# Генерирует version.json (apkUrl и releasedAt подставляются автоматически).
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

# ── Показываем текущий релиз ───────────────────────────────────────────────────
# version.json уже может содержать данные предыдущей сборки. Выводим их до
# вопросов, чтобы новые значения можно было сравнить с текущими.
echo ""
if [[ -f version.json ]]; then
  echo "📋  Текущие значения из version.json:"
  node -e "
    const fs = require('fs');
    let info;
    try {
      info = JSON.parse(fs.readFileSync('version.json', 'utf8'));
    } catch (error) {
      console.error('❌  Не удалось прочитать version.json:', error.message);
      process.exit(1);
    }
    console.log('   versionName: ' + (info.versionName ?? 'не указано'));
    console.log('   versionCode: ' + (info.versionCode ?? 'не указано'));
    console.log('   changelog:  ' + (info.changelog ?? 'не указано'));
    console.log('   releasedAt: ' + (info.releasedAt ?? 'не указано'));
    console.log('   apkUrl:     ' + (info.apkUrl ?? 'не указано'));
  "
else
  echo "ℹ️   version.json не найден — текущие значения отсутствуют"
fi
echo ""
echo "📦  Заполни новые данные релиза"
echo ""

# versionName
while true; do
  read -rp "   Новая версия (versionName, например 2.0.6): " VERSION_NAME
  VERSION_NAME="${VERSION_NAME#"${VERSION_NAME%%[![:space:]]*}"}" # ltrim
  VERSION_NAME="${VERSION_NAME%"${VERSION_NAME##*[![:space:]]}"}" # rtrim
  if [[ -n "$VERSION_NAME" ]]; then break; fi
  echo "   ❌  Поле не может быть пустым"
done

# versionCode — увеличиваем автоматически относительно предыдущей сборки.
VERSION_CODE=$(node -e "
  const fs = require('fs');
  let current = 0;
  if (fs.existsSync('version.json')) {
    const info = JSON.parse(fs.readFileSync('version.json', 'utf8'));
    const code = Number(info.versionCode ?? 0);
    if (!Number.isInteger(code) || code < 0) {
      throw new Error('versionCode в version.json должен быть целым неотрицательным числом');
    }
    current = code;
  }
  process.stdout.write(String(current + 1));
")
echo "   Новый номер сборки (versionCode): $VERSION_CODE (автоматически)"

# changelog
while true; do
  read -rp "   Новый changelog: " CHANGELOG
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
