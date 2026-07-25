#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Family Messenger — Admin CLI
# Интерактивное управление пользователями через Docker-контейнер api.
#
# Запуск:
#   cd /opt/messenger          # папка с репозиторием на сервере
#   ./deploy/admin-cli.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

# ── Цвета ────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
RESET='\033[0m'

# ── Найти docker-compose.yml ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
  printf "${RED}Ошибка:${RESET} файл docker-compose.yml не найден в %s\n" "$SCRIPT_DIR" >&2
  exit 1
fi

# ── Враппер для запуска admin.mjs внутри контейнера ──────────────────────────
run_admin() {
  docker compose -f "$COMPOSE_FILE" exec api \
    node /app/dist/admin.mjs "$@"
}

# ── Проверить, что контейнер api запущен ─────────────────────────────────────
check_container() {
  if ! docker compose -f "$COMPOSE_FILE" ps --status running api 2>/dev/null | grep -q "api"; then
    printf "${RED}Ошибка:${RESET} контейнер api не запущен.\n"
    printf "Запустите стек командой:  docker compose -f %s up -d\n" "$COMPOSE_FILE"
    exit 1
  fi
}

# ── Ввод строки: prompt <подсказка> <имя_переменной> ────────────────────────
# Не использует command substitution — результат кладётся в переменную напрямую.
ask() {
  printf "%b" "$1"
  read -r "$2" </dev/tty
}

# ── Ввод PIN без вывода на экран ─────────────────────────────────────────────
ask_pin() {
  printf "%b" "$1"
  stty -echo 2>/dev/null || true
  read -r "$2" </dev/tty
  stty echo 2>/dev/null || true
  printf "\n"
}

# ── Меню ─────────────────────────────────────────────────────────────────────
show_menu() {
  printf "\n${BOLD}${CYAN}══════════════════════════════════════${RESET}\n"
  printf "${BOLD}  Family Messenger — Управление юзерами${RESET}\n"
  printf "${BOLD}${CYAN}══════════════════════════════════════${RESET}\n"
  printf "  ${BOLD}1.${RESET} Список пользователей\n"
  printf "  ${BOLD}2.${RESET} Создать пользователя\n"
  printf "  ${BOLD}3.${RESET} Заблокировать пользователя\n"
  printf "  ${BOLD}4.${RESET} Разблокировать пользователя\n"
  printf "  ${BOLD}5.${RESET} Сменить PIN пользователю\n"
  printf "  ${BOLD}0.${RESET} Выход\n"
  printf "${CYAN}──────────────────────────────────────${RESET}\n"
}

# ── Операции ─────────────────────────────────────────────────────────────────

do_list() {
  printf "\n${YELLOW}Список пользователей:${RESET}\n"
  run_admin list-users
}

do_create() {
  printf "\n${YELLOW}Создание пользователя${RESET}\n"

  ask "  ID (логин, латиница без пробелов): " USER_ID
  [ -z "$USER_ID" ] && printf "${RED}ID не может быть пустым.${RESET}\n" && return

  ask "  Отображаемое имя: " USER_NAME
  [ -z "$USER_NAME" ] && printf "${RED}Имя не может быть пустым.${RESET}\n" && return

  ask_pin "  PIN (6 цифр, ввод скрыт): " USER_PIN
  if ! printf "%s" "$USER_PIN" | grep -qE '^[0-9]{6}$'; then
    printf "${RED}Ошибка: PIN должен состоять ровно из 6 цифр.${RESET}\n"
    return
  fi

  ask_pin "  Повторите PIN: " PIN2
  if [ "$USER_PIN" != "$PIN2" ]; then
    printf "${RED}Ошибка: PIN-коды не совпадают.${RESET}\n"
    return
  fi

  if run_admin create-user --id "$USER_ID" --name "$USER_NAME" --pin "$USER_PIN"; then
    printf "${GREEN}✓ Пользователь создан.${RESET}\n"
  fi
}

do_block() {
  printf "\n${YELLOW}Блокировка пользователя${RESET}\n"
  do_list
  ask "  ID пользователя для блокировки: " USER_ID
  [ -z "$USER_ID" ] && return
  if run_admin block-user --id "$USER_ID"; then
    printf "${GREEN}✓ Пользователь заблокирован.${RESET}\n"
  fi
}

do_unblock() {
  printf "\n${YELLOW}Разблокировка пользователя${RESET}\n"
  do_list
  ask "  ID пользователя для разблокировки: " USER_ID
  [ -z "$USER_ID" ] && return
  if run_admin unblock-user --id "$USER_ID"; then
    printf "${GREEN}✓ Пользователь разблокирован.${RESET}\n"
  fi
}

do_change_pin() {
  printf "\n${YELLOW}Смена PIN${RESET}\n"
  do_list
  ask "  ID пользователя: " USER_ID
  [ -z "$USER_ID" ] && return

  ask_pin "  Новый PIN (6 цифр, ввод скрыт): " USER_PIN
  if ! printf "%s" "$USER_PIN" | grep -qE '^[0-9]{6}$'; then
    printf "${RED}Ошибка: PIN должен состоять ровно из 6 цифр.${RESET}\n"
    return
  fi

  ask_pin "  Повторите новый PIN: " PIN2
  if [ "$USER_PIN" != "$PIN2" ]; then
    printf "${RED}Ошибка: PIN-коды не совпадают.${RESET}\n"
    return
  fi

  if run_admin change-pin --id "$USER_ID" --pin "$USER_PIN"; then
    printf "${GREEN}✓ PIN изменён.${RESET}\n"
  fi
}

# ── Точка входа ───────────────────────────────────────────────────────────────
check_container

while true; do
  show_menu
  ask "  Выберите действие [0-5]: " CHOICE
  case "$CHOICE" in
    1) do_list ;;
    2) do_create ;;
    3) do_block ;;
    4) do_unblock ;;
    5) do_change_pin ;;
    0) printf "\nПока!\n"; exit 0 ;;
    *) printf "${RED}Неверный выбор. Введите цифру от 0 до 5.${RESET}\n" ;;
  esac
done
