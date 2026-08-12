#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# push-update.sh — выложить APK и version.json на VPS.
#
# Работает независимо от способа сборки: EAS Cloud, GitHub Actions, локальная.
# version.json заполняется вручную и лежит в корне messenger-android.
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

# ── Входные файлы ─────────────────────────────────────────────────────────────
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

VERSION_SRC="version.json"
if [[ ! -f "$VERSION_SRC" ]]; then
  echo "❌  Файл не найден: $VERSION_SRC"
  echo "    Создай и заполни artifacts/messenger-android/version.json"
  exit 1
fi

# Проверяем формат и обязательные поля, но не генерируем version.json.
node -e "
const fs = require('fs');
let info;
try {
  info = JSON.parse(fs.readFileSync('version.json', 'utf8'));
} catch (error) {
  console.error('❌  version.json содержит некорректный JSON');
  console.error('   ' + error.message);
  process.exit(1);
}
if (!Number.isInteger(info.versionCode) || info.versionCode < 1) {
  console.error('❌  version.json: versionCode должен быть положительным целым числом');
  process.exit(1);
}
if (typeof info.versionName !== 'string' || !info.versionName.trim()) {
  console.error('❌  version.json: отсутствует versionName');
  process.exit(1);
}
if (typeof info.apkUrl !== 'string' || !info.apkUrl.trim()) {
  console.error('❌  version.json: отсутствует apkUrl');
  process.exit(1);
}
console.log('📦  version.json: ' + info.versionName + ' (' + info.versionCode + ')');
"

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

# ── Загружаем на VPS ──────────────────────────────────────────────────────────
echo ""
echo "🚀  Загружаю на ${VPS_HOST}:${VPS_PATH}…"

# Создаём директорию на VPS если её нет
ssh "$VPS_HOST" "mkdir -p $VPS_PATH"

# Сначала APK (он большой), потом version.json
# version.json обновляется ПОСЛЕДНИМ — пока он не обновился, приложения
# не увидят новую версию и не начнут скачивать APK.
scp "$APK_SRC"     "${VPS_HOST}:${VPS_PATH}/messenger.apk"
scp "version.json" "${VPS_HOST}:${VPS_PATH}/version.json"

echo ""
echo "✅  Готово!"
echo ""
echo "   APK      → ${VPS_HOST}:${VPS_PATH}/messenger.apk"
echo "   Метаданные → ${VPS_HOST}:${VPS_PATH}/version.json"
echo ""
echo "   Приложения на устройствах увидят обновление при следующем запуске."
