# Обновление приложения по кнопке (in-app updater)

## Как это работает
1. Приложение раз в сутки (или по кнопке на экране «О приложении») запрашивает
   `https://<сервер>/updates/version.json`.
2. Если `versionCode` в файле больше, чем у установленного APK — показывается
   баннер/карточка обновления.
3. По кнопке «Обновить» APK скачивается и запускается системный установщик Android.

## Контракт version.json
```json
{
  "versionCode": 2,
  "versionName": "1.1.0",
  "releasedAt": "2026-07-29T10:00:00Z",
  "changelog": "Что нового…",
  "apkUrl": "messenger.apk"
}
```
`apkUrl` — имя файла относительно `/updates/` или абсолютный URL.

## Разовая настройка VPS
```bash
# 1. Создать каталог для обновлений
sudo mkdir -p /opt/messenger/updates

# 2. Обновить конфиги и перезапустить nginx (из каталога deploy/)
git pull
docker compose up -d nginx
```
nginx контейнер монтирует `/opt/messenger/updates` → `/var/www/updates` (read-only)
и раздаёт его по `location /updates/`.

## Выкладка каждого обновления
1. В GitHub Actions собрался артефакт `messenger-android-v<N>` — внутри
   `messenger-family.apk` и готовый `version.json`.
2. Скопировать на VPS:
   ```bash
   scp version.json vps:/opt/messenger/updates/
   scp messenger-family.apk vps:/opt/messenger/updates/messenger.apk
   ```
3. Проверить: `curl https://chat.naviry.xyz/updates/version.json`

Клиенты увидят обновление при следующей проверке (≤24 ч) или сразу — по кнопке
«Проверить обновления» на экране «О приложении».

> Перед сборкой релиза не забудьте поднять `versionCode` и `version` в
> `artifacts/messenger-android/app.json` — обновление предлагается только если
> `versionCode` на сервере больше установленного.
