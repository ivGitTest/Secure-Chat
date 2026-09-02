#!/bin/bash
# deploy-update.sh
# Использование:
#   ./deploy-update.sh <url_apk>
#   ./deploy-update.sh <github_actions_artifact_url>
#
# Принимает:
#   • прямую ссылку на APK (EAS Cloud, любой CDN)
#   • ссылку на страницу артефакта GitHub Actions:
#       https://github.com/OWNER/REPO/actions/runs/RUN_ID/artifacts/ARTIFACT_ID
#
# Прямая ссылка на APK не содержит метаданные версии: в этом режиме
# version.json на VPS сохраняется без изменений. GitHub Actions-архив должен
# содержать и APK, и version.json.
#
# Для GitHub-артефакта нужен токен с правом Actions: Read:
#   export GITHUB_TOKEN='ghp_...'   # или GH_TOKEN
#   ./deploy-update.sh "https://github.com/..."

set -euo pipefail

# ── URL helpers ───────────────────────────────────────────────────────────────

is_url() {
  # Checks that the argument starts with http:// or https://
  case "$1" in
    http://*|https://*) return 0 ;;
    *) return 1 ;;
  esac
}

is_github_artifact_url() {
  # Match https://github.com/OWNER/REPO/actions/runs/RUN/artifacts/ID
  # Uses case-glob rather than [[ =~ ]] to avoid bash ERE portability issues.
  case "$1" in
    https://github.com/*/actions/runs/*/artifacts/*) return 0 ;;
    *) return 1 ;;
  esac
}

# ── Read URL ──────────────────────────────────────────────────────────────────

APK_URL="${1:-}"

if ! is_url "${APK_URL}"; then
  if [[ -n "${APK_URL}" ]]; then
    echo "Параметр не является URL."
  fi

  while true; do
    read -r -p "Укажи URL APK или GitHub-артефакта: " APK_URL
    if is_url "${APK_URL}"; then
      break
    fi
    echo "Некорректный URL. Используй ссылку, начинающуюся с http:// или https://."
  done
fi

# ── Temp dir (cleaned up on exit) ────────────────────────────────────────────

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

UPDATES_DIR="${UPDATES_DIR:-/opt/messenger/updates}"
mkdir -p "${UPDATES_DIR}"
APK_PATH="${TMP_DIR}/messenger.apk"
VERSION_PATH="${TMP_DIR}/version.json"

# ── Download functions ────────────────────────────────────────────────────────

download_direct_apk() {
  echo "Скачиваю APK напрямую..."
  curl -fL --progress-bar "${APK_URL}" -o "${TMP_DIR}/messenger.apk"
}

download_github_artifact() {
  # Extract owner, repo, artifact_id from the browser-facing URL.
  # URL shape: https://github.com/OWNER/REPO/actions/runs/RUN_ID/artifacts/ARTIFACT_ID
  local without_scheme="${APK_URL#https://github.com/}"   # OWNER/REPO/actions/...
  local owner="${without_scheme%%/*}"
  local rest="${without_scheme#*/}"                        # REPO/actions/...
  local repo="${rest%%/*}"
  local artifact_id="${APK_URL##*/artifacts/}"
  # Strip any trailing slash or query string from artifact_id
  artifact_id="${artifact_id%%/*}"
  artifact_id="${artifact_id%%\?*}"
  artifact_id="${artifact_id%%#*}"

  local api_url="https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifact_id}/zip"
  local archive_path="${TMP_DIR}/artifact.zip"

  echo "GitHub Actions-артефакт: ${owner}/${repo} id=${artifact_id}"
  echo "API URL: ${api_url}"

  # GitHub API requires authentication even for public repos when downloading artifacts.
  local token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
  if [[ -z "${token}" ]]; then
    echo "" >&2
    echo "Ошибка: для скачивания GitHub Actions-артефакта нужен токен." >&2
    echo "  Создай fine-grained PAT с правом Actions: Read и выполни:" >&2
    echo "    export GITHUB_TOKEN='ghp_...'" >&2
    echo "" >&2
    return 1
  fi

  echo "Скачиваю ZIP-архив артефакта..."
  local http_code
  http_code="$(curl -sS -L \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    -H "Authorization: Bearer ${token}" \
    -o "${archive_path}" \
    -w "%{http_code}" \
    "${api_url}")"

  if [[ "${http_code}" != 2* ]]; then
    echo "" >&2
    echo "Ошибка: GitHub API вернул HTTP ${http_code}." >&2
    if [[ "${http_code}" == "401" ]]; then
      echo "  Токен недействителен или истёк." >&2
    elif [[ "${http_code}" == "403" ]]; then
      echo "  Недостаточно прав. Нужно разрешение Actions: Read." >&2
    elif [[ "${http_code}" == "404" ]]; then
      echo "  Артефакт не найден. Возможно, истёк срок хранения (retention-days)." >&2
    fi
    return 1
  fi

  if ! unzip -tq "${archive_path}" >/dev/null 2>&1; then
    echo "Ошибка: GitHub вернул не ZIP-архив." >&2
    return 1
  fi

  # Find the APK inside the archive
  local apk_name
  apk_name="$(unzip -Z1 "${archive_path}" | grep -Ei '\.apk$' | head -1 || true)"
  if [[ -z "${apk_name}" ]]; then
    echo "Ошибка: APK-файл не найден внутри артефакта." >&2
    echo "Содержимое архива:" >&2
    unzip -Z1 "${archive_path}" >&2
    return 1
  fi

  echo "Извлекаю ${apk_name}..."
  unzip -p "${archive_path}" "${apk_name}" > "${APK_PATH}"

  # version.json находится внутри артефакта во вложенной директории
  # (например, .../artifacts/messenger-android/version.json). Ищем его
  # по имени, а не по фиксированному пути.
  local version_name
  version_name="$(unzip -Z1 "${archive_path}" | grep -Ei '(^|/)version\.json$' | head -1 || true)"
  if [[ -z "${version_name}" ]]; then
    echo "Ошибка: version.json не найден внутри GitHub-артефакта." >&2
    echo "APK не установлен, чтобы не оставить старые метаданные рядом с новой сборкой." >&2
    return 1
  fi

  echo "Извлекаю ${version_name}..."
  unzip -p "${archive_path}" "${version_name}" > "${VERSION_PATH}"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

IS_GITHUB_ARTIFACT=0
if is_github_artifact_url "${APK_URL}"; then
  IS_GITHUB_ARTIFACT=1
  download_github_artifact
else
  download_direct_apk
fi

# ── Validate and install atomically ──────────────────────────────────────────

if [[ ! -s "${APK_PATH}" ]]; then
  echo "Ошибка: скачанный APK пустой." >&2
  exit 1
fi

if [[ "${IS_GITHUB_ARTIFACT:-0}" == "1" && ! -s "${VERSION_PATH}" ]]; then
  echo "Ошибка: для GitHub-артефакта отсутствует version.json." >&2
  exit 1
fi

if [[ -s "${VERSION_PATH}" ]]; then
  if ! jq -e '
    (.versionCode | type == "number" and . > 0 and floor == .) and
    (.versionName | type == "string" and length > 0) and
    (.apkUrl | type == "string" and length > 0)
  ' "${VERSION_PATH}" >/dev/null; then
    echo "Ошибка: version.json имеет неожиданный формат." >&2
    cat "${VERSION_PATH}" >&2
    exit 1
  fi

  new_version_code="$(jq -r '.versionCode' "${VERSION_PATH}")"
  current_version_code=0
  if [[ -s "${UPDATES_DIR}/version.json" ]]; then
    if ! current_version_code="$(jq -r '.versionCode // 0' "${UPDATES_DIR}/version.json" 2>/dev/null)"; then
      echo "Ошибка: текущий version.json на VPS повреждён." >&2
      exit 1
    fi
  fi

  if (( new_version_code < current_version_code )); then
    echo "Ошибка: новая версия ${new_version_code} меньше текущей ${current_version_code}." >&2
    echo "Обновление остановлено, APK не заменён." >&2
    exit 1
  fi
fi

# Сначала заменяем APK, затем version.json. Так nginx не сможет увидеть новую
# версию в метаданных раньше, чем новый APK станет доступен для скачивания.
install -m 0644 "${APK_PATH}" "${UPDATES_DIR}/messenger.apk.tmp"
mv -f "${UPDATES_DIR}/messenger.apk.tmp" "${UPDATES_DIR}/messenger.apk"

if [[ -s "${VERSION_PATH}" ]]; then
  install -m 0644 "${VERSION_PATH}" "${UPDATES_DIR}/version.json.tmp"
  mv -f "${UPDATES_DIR}/version.json.tmp" "${UPDATES_DIR}/version.json"
fi

echo ""
echo "✓ APK обновлён. Текущий version.json:"
cat "${UPDATES_DIR}/version.json" 2>/dev/null || echo "(version.json отсутствует)"
echo ""
echo "✓ Готово."
