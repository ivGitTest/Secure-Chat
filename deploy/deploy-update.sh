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
  unzip -p "${archive_path}" "${apk_name}" > "${TMP_DIR}/messenger.apk"
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

if is_github_artifact_url "${APK_URL}"; then
  download_github_artifact
else
  download_direct_apk
fi

# ── Validate and install atomically ──────────────────────────────────────────

if [[ ! -s "${TMP_DIR}/messenger.apk" ]]; then
  echo "Ошибка: скачанный APK пустой." >&2
  exit 1
fi

# Write to a temp name first, then rename — Nginx never sees a partial file.
install -m 0644 "${TMP_DIR}/messenger.apk" "${UPDATES_DIR}/messenger.apk.tmp"
mv -f "${UPDATES_DIR}/messenger.apk.tmp" "${UPDATES_DIR}/messenger.apk"

echo ""
echo "✓ APK обновлён. Текущий version.json:"
cat "${UPDATES_DIR}/version.json" 2>/dev/null || echo "(version.json отсутствует)"
echo ""
echo "✓ Готово."
