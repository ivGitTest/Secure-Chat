# Обновление приложения по кнопке (in-app updater)

**[English version](#english-version)**

## Оглавление

- [Как это работает](#как-это-работает)
- [Контракт version.json](#контракт-versionjson)
- [Единственный источник версии — release.json](#единственный-источник-версии--releasejson)
- [Разовая настройка VPS](#разовая-настройка-vps)
- [Выкладка обновления одной командой](#выкладка-обновления-одной-командой)
- [Сборка через EAS Cloud](#сборка-через-eas-cloud)
- [Сборка через GitHub Actions](#сборка-через-github-actions)

## Как это работает

1. Приложение раз в сутки (или по кнопке на экране «О приложении») запрашивает
   `https://<сервер>/updates/version.json`.
2. Если `versionCode` в файле больше, чем у установленного APK — показывается
   баннер/карточка обновления.
3. По кнопке «Обновить» APK скачивается и запускается системный установщик Android.

### Логика версионирования на клиенте

```
effectiveCode = max(nativeBuildVersion, installedCode)
```

- `nativeBuildVersion` — реальный versionCode установленного APK из Android Package Manager.
- `installedCode` — versionCode, зафиксированный updater'ом в AsyncStorage
  **до** запуска установщика (Android убивает процесс во время установки,
  поэтому фиксируем заранее).
- Если `nativeBuildVersion > installedCode` (например, APK обновили вручную),
  AsyncStorage синхронизируется с реальным значением автоматически при следующем запуске.

## Контракт version.json

```json
{
  "versionCode": 9,
  "versionName": "2.0.5",
  "releasedAt": "2026-08-12T10:00:00Z",
  "changelog": "Что нового…",
  "apkUrl": "messenger.apk"
}
```

`apkUrl` — имя файла относительно `/updates/` или абсолютный URL.

> ⚠ `versionCode` в `version.json` **должен точно совпадать** с versionCode собранного APK.
> Расхождение приводит к петле обновлений.

## Единственный источник версии — release.json

Все версии берутся из `artifacts/messenger-android/release.json`:

```json
{
  "version": "2.0.5",
  "versionCode": 9,
  "releaseNotes": "Что нового в этой версии"
}
```

Перед каждым релизом:
1. Поменять `version` и увеличить `versionCode` на 1.
2. Обновить `releaseNotes`.

`version.json` генерируется автоматически скриптом — вручную его не редактировать.

## Разовая настройка VPS

```bash
# 1. Создать каталог для обновлений
ssh user@<vps> mkdir -p ~/docker_containers/messenger/updates

# 2. Настроить переменную окружения для push-update.sh
echo 'VPS_HOST=user@<ip>' >> artifacts/messenger-android/.env
```

nginx монтирует `~/docker_containers/messenger/updates` → `/var/www/updates`
и раздаёт по `location /updates/`.

## Выкладка обновления одной командой

Независимо от способа сборки (EAS или GitHub Actions) выкладка на VPS делается одним скриптом:

```bash
cd artifacts/messenger-android
./scripts/push-update.sh ~/Downloads/messenger-preview.apk
```

Скрипт автоматически:
- читает `release.json` (version + versionCode + releaseNotes)
- генерирует `version.json`
- загружает APK как `messenger.apk` на VPS
- загружает `version.json` на VPS **последним** (пока не загружен — устройства не видят обновление)

Проверить результат: `curl https://chat.example.com/updates/version.json`

## Сборка через EAS Cloud

```bash
cd artifacts/messenger-android

# 1. Обновить release.json (version, versionCode, releaseNotes)

# 2. Запустить сборку в облаке
./scripts/eas-build.sh              # profile: preview (APK)

# 3. Дождаться завершения → скачать APK из EAS Dashboard

# 4. Выложить на VPS
./scripts/push-update.sh ~/Downloads/<скачанный>.apk
```

## Сборка через GitHub Actions

1. Обновить `release.json` (version, versionCode, releaseNotes) → коммит → push.
2. GitHub Actions → **Build Android APK** → **Run workflow**.
3. В артефакте `messenger-android-v<N>` — `messenger-family.apk`.
4. Выложить на VPS:
   ```bash
   cd artifacts/messenger-android
   ./scripts/push-update.sh ~/Downloads/messenger-family.apk
   ```

Клиенты увидят обновление при следующей проверке (≤24 ч) или сразу — по кнопке
«Проверить обновления» на экране «О приложении».

---

# English Version

# In-App Update (Update by Button)

**[Русская версия](#обновление-приложения-по-кнопке-in-app-updater)**

## Table of Contents

- [How It Works](#how-it-works)
- [version.json Contract](#versionjson-contract)
- [Single Source of Truth — release.json](#single-source-of-truth--releasejson)
- [One-time VPS Setup](#one-time-vps-setup)
- [Deploy Update in One Command](#deploy-update-in-one-command)
- [Build via EAS Cloud](#build-via-eas-cloud)
- [Build via GitHub Actions](#build-via-github-actions)

## How It Works

1. App once daily (or by button on "About" screen) requests `https://<server>/updates/version.json`.
2. If `versionCode` in file is higher than installed APK — update banner/card shown.
3. On "Update" button tap APK downloads and Android system installer launches.

### Client Versioning Logic

```
effectiveCode = max(nativeBuildVersion, installedCode)
```

- `nativeBuildVersion` — actual versionCode of installed APK from Android Package Manager.
- `installedCode` — versionCode recorded by updater in AsyncStorage **before** launching installer (Android kills process during install, so we record beforehand).
- If `nativeBuildVersion > installedCode` (e.g., APK updated manually), AsyncStorage syncs with real value automatically on next launch.

## version.json Contract

```json
{
  "versionCode": 9,
  "versionName": "2.0.5",
  "releasedAt": "2026-08-12T10:00:00Z",
  "changelog": "What's new…",
  "apkUrl": "messenger.apk"
}
```

`apkUrl` — filename relative to `/updates/` or absolute URL.

> ⚠ `versionCode` in `version.json` **must exactly match** versionCode of built APK. Mismatch causes update loop.

## Single Source of Truth — release.json

All versions come from `artifacts/messenger-android/release.json`:

```json
{
  "version": "2.0.5",
  "versionCode": 9,
  "releaseNotes": "What's new in this version"
}
```

Before each release:
1. Change `version` and increment `versionCode` by 1.
2. Update `releaseNotes`.

`version.json` generated automatically by script — don't edit manually.

## One-time VPS Setup

```bash
# 1. Create updates directory
ssh user@<vps> mkdir -p ~/docker_containers/messenger/updates

# 2. Set env var for push-update.sh
echo 'VPS_HOST=user@<ip>' >> artifacts/messenger-android/.env
```

nginx mounts `~/docker_containers/messenger/updates` → `/var/www/updates` and serves via `location /updates/`.

## Deploy Update in One Command

Regardless of build method (EAS or GitHub Actions) VPS deploy is one script:

```bash
cd artifacts/messenger-android
./scripts/push-update.sh ~/Downloads/messenger-preview.apk
```

Script automatically:
- reads `release.json` (version + versionCode + releaseNotes)
- generates `version.json`
- uploads APK as `messenger.apk` to VPS
- uploads `version.json` to VPS **last** (devices don't see update until uploaded)

Verify: `curl https://chat.example.com/updates/version.json`

## Build via EAS Cloud

```bash
cd artifacts/messenger-android

# 1. Update release.json (version, versionCode, releaseNotes)

# 2. Run cloud build
./scripts/eas-build.sh              # profile: preview (APK)

# 3. Wait for completion → download APK from EAS Dashboard

# 4. Deploy to VPS
./scripts/push-update.sh ~/Downloads/<downloaded>.apk
```

## Build via GitHub Actions

1. Update `release.json` (version, versionCode, releaseNotes) → commit → push.
2. GitHub Actions → **Build Android APK** → **Run workflow**.
3. In artifact `messenger-android-v<N>` — `messenger-family.apk`.
4. Deploy to VPS:
   ```bash
   cd artifacts/messenger-android
   ./scripts/push-update.sh ~/Downloads/messenger-family.apk
   ```

Clients see update on next check (≤24h) or immediately — via "Check Updates" button on "About" screen.
