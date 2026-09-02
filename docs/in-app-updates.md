# Обновление приложения по кнопке (in-app updater)

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
