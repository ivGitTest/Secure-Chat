# Обновление приложения по кнопке (in-app updater)

## Оглавление

- [Как это работает](#как-это-работает)
- [Контракт version.json](#контракт-versionjson)
- [Разовая настройка VPS](#разовая-настройка-vps)
- [Выкладка каждого обновления](#выкладка-каждого-обновления)

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
sudo mkdir -p ~/docker_containers/messenger/updates

# 2. Обновить конфиги и перезапустить nginx (из каталога deploy/)
git pull
docker compose up -d nginx
```
nginx контейнер монтирует `~/docker_containers/messenger/updates` → `/var/www/updates` (read-only)
и раздаёт его по `location /updates/`.

## Выкладка каждого обновления
1. В `artifacts/messenger-android/app.json` меняются только значения версии:
   ```json
   {
     "expo": {
       "version": "1.2.0",
       "android": {
         "versionCode": 3
       }
     }
   }
   ```
   `version` и `android.versionCode` — единственный источник версии. Отдельно
   редактировать эти значения в `version.json` не нужно.
2. Запустить GitHub Actions → **Build Android APK** → **Run workflow**.
   В поле **Что нового в этой версии** можно отдельно указать release notes.
3. В артефакте `messenger-android-v<N>` будут автоматически собраны
   `messenger-family.apk` и готовый `version.json`. Workflow сам переносит
   `version` и `android.versionCode` из `app.json` в `version.json`.
4. Скопировать на VPS:
   ```bash
   scp version.json vps:~/docker_containers/messenger/updates/
   scp messenger-family.apk vps:~/docker_containers/messenger/updates/messenger.apk
   ```
5. Проверить: `curl https://chat.naviry.xyz/updates/version.json`

Клиенты увидят обновление при следующей проверке (≤24 ч) или сразу — по кнопке
«Проверить обновления» на экране «О приложении».

> `versionCode` должен увеличиваться на каждом APK-релизе. Если он не изменился,
> Android не сможет корректно отличить новый APK от уже установленного.
