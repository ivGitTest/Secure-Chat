#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# push-update.sh — выложить APK и version.json на VPS.
#
# Работает независимо от способа сборки: EAS Cloud, GitHub Actions, локальная.
# Единственный источник истины — release.json в корне messenger-android.
#
# Использование:
#   ./scripts/push-update.sh <path/to/messenger.apk>
#
# Пример:
#   ./scripts/push-update.sh ~/Downloads/messenger-preview.apk
#
# Переменные окружения (можно задать в .env или экспортировать):
#   VPS_HOST   — адрес VPS, например user@1.2.3.4  (по умолчанию ищет в .env)
#   VPS_PATH   — путь на VPS, по умолчанию ~/docker_containers/messenger/updates
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Аргумент: APK-файл ───────────────────────────────────────────────────────
APK_SRC="${1:-}"
if [[ -z "$APK_SRC" ]]; then
  echo "❌  Укажи путь к APK:"
  echo "    ./scripts/push-update.sh ~/Downloads/messenger-preview.apk"
  exit 1
fi
if [[ ! -f "$APK_SRC" ]]; then
  echo "❌  Файл не найден: $APK_SRC"
  exit 1
fi

# ── Переменные окружения ─────────────────────────────────────────────────────
# Подгружаем .env если он есть (не обязателен)
if [[ -f ".env" ]]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | grep '=' | xargs)
fi

VPS_HOST="${VPS_HOST:-}"
VPS_PATH="${VPS_PATH:-~/docker_containers/messenger/updates}"

if [[ -z "$VPS_HOST" ]]; then
  echo "❌  Задай VPS_HOST (например: user@1.2.3.4)"
  echo "    Варианты:"
  echo "      export VPS_HOST=user@1.2.3.4"
  echo "      echo 'VPS_HOST=user@1.2.3.4' >> .env"
  exit 1
fi

# ── Читаем release.json ───────────────────────────────────────────────────────
echo ""
echo "📦  Читаю release.json…"
node -e "
const r = require('./release.json');
if (!r.version)     { console.error('release.json: нет поля version');     process.exit(1); }
if (!r.versionCode) { console.error('release.json: нет поля versionCode'); process.exit(1); }
console.log('');
console.log('   Версия    : ' + r.version + ' (' + r.versionCode + ')');
console.log('   Заметки   : ' + (r.releaseNotes || '(не указаны)'));
"

# ── Генерируем version.json ───────────────────────────────────────────────────
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
node -e "
const r   = require('./release.json');
const fs  = require('fs');
const info = {
  versionCode : r.versionCode,
  versionName : r.version,
  releasedAt  : '$BUILD_DATE',
  changelog   : r.releaseNotes || '',
  apkUrl      : 'messenger.apk',
};
fs.writeFileSync('version.json', JSON.stringify(info, null, 2));
console.log('');
console.log('✅  version.json:');
console.log(JSON.stringify(info, null, 2));
"

# ── Загружаем на VPS ──────────────────────────────────────────────────────────
echo ""
echo "🚀  Загружаю на ${VPS_HOST}:${VPS_PATH}…"

# Создаём директорию на VPS если её нет
ssh "$VPS_HOST" "mkdir -p $VPS_PATH"

# Сначала APK (он большой), потом version.json
# version.json обновляется ПОСЛЕДНИМ — пока он не обновился, приложения
# на устройствах не увидят новую версию и не начнут качать.
scp "$APK_SRC"     "${VPS_HOST}:${VPS_PATH}/messenger.apk"
scp "version.json" "${VPS_HOST}:${VPS_PATH}/version.json"

echo ""
echo "✅  Готово!"
echo ""
echo "   APK      → ${VPS_HOST}:${VPS_PATH}/messenger.apk"
echo "   Метаданные → ${VPS_HOST}:${VPS_PATH}/version.json"
echo ""
echo "   Приложения на устройствах увидят обновление при следующем запуске."
