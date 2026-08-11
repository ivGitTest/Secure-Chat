#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Сборка APK через EAS CLI.
# Версия, номер сборки и release notes берутся из release.json.
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
RELEASE_NOTES=$(node -p "require('./release.json').releaseNotes || ''")

# Показать что собираем
node -e "
const r = require('./release.json');
console.log('');
console.log('📦  Версия : ' + r.version + ' (' + r.versionCode + ')');
console.log('📝  Заметки: ' + (r.releaseNotes || '(не указаны)'));
console.log('🔧  Профиль: $PROFILE');
console.log('');
"

EAS_ARGS=(build --profile "$PROFILE" --platform android)
if [[ -n "$RELEASE_NOTES" ]]; then
  EAS_ARGS+=(--message "$RELEASE_NOTES")
fi

# Use an ephemeral local CLI so a global `eas` installation is not required.
pnpm dlx eas-cli@latest "${EAS_ARGS[@]}"

# Генерируем version.json для выгрузки на VPS
node -e "
const r = require('./release.json');
const fs = require('fs');
const info = {
  versionCode: r.versionCode,
  versionName: r.version,
  releasedAt: new Date().toISOString(),
  changelog: r.releaseNotes || '',
  apkUrl: 'messenger.apk',
};
fs.writeFileSync('version.json', JSON.stringify(info, null, 2));
console.log('✅ version.json создан:');
console.log(JSON.stringify(info, null, 2));
"

echo ""
echo "Следующий шаг — выложить на VPS:"
echo "  scp <скачанный.apk> vps:~/docker_containers/messenger/updates/messenger.apk"
echo "  scp version.json    vps:~/docker_containers/messenger/updates/"
