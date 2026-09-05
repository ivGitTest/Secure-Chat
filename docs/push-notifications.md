# Push-уведомления: настройка, диагностика, проверка

**[English version](#english-version)**

## Оглавление

- [Как работает доставка](#как-работает-доставка)
- [Настройка FCM V1 Service Account Key на expo.dev](#настройка-fcm-v1-service-account-key-на-expodev)
  - [1. Создать ключ в Firebase Console](#1-создать-ключ-в-firebase-console)
  - [2. Загрузить ключ в Expo](#2-загрузить-ключ-в-expo)
- [Каналы уведомлений Android](#каналы-уведомлений-android)
- [Таблицы в БД](#таблицы-в-бд)
  - [`push_tokens`](#push_tokens)
  - [`users`](#users)
- [Проверка токенов в БД](#проверка-токенов-в-бд)
- [Ручной тест пуша (без нашего сервера)](#ручной-тест-пуша-без-вашего-сервера)
- [Проверка логов сервера](#проверка-логов-сервера)
- [Настройки Xiaomi MIUI (обязательно)](#настройки-xiaomi-miui-обязательно)
- [Обновление сервера на VPS](#обновление-сервера-на-vps)

## Как работает доставка

```
api-server
  → POST https://exp.host/--/api/v2/push/send   (ExponentPushToken)
    → Expo Push Service
      → Google FCM
        → Android-устройство
```

Expo участвует в **двух независимых процессах**:

| Процесс | Где настраивается |
|---|---|
| Сборка APK | GitHub Actions (`google-services.json` из секрета `GOOGLE_SERVICES_JSON`) |
| Доставка push-уведомлений | expo.dev → Credentials → FCM V1 Service Account Key |

`google-services.json` в APK позволяет **устройству принимать** уведомления. FCM V1 Service Account Key на expo.dev позволяет **Expo отправлять** их через Google FCM. Оба нужны.

---

## Настройка FCM V1 Service Account Key на expo.dev

### 1. Создать ключ в Firebase Console

1. Открыть [console.firebase.google.com](https://console.firebase.google.com) → ваш проект (`family-messenger`)
2. ⚙️ → **Project settings** → вкладка **Service accounts**
3. Нажать **Generate new private key** → скачается файл `family-messenger-xxxx-firebase-adminsdk-xxxx.json`

### 2. Загрузить ключ в Expo

1. Открыть [expo.dev](https://expo.dev) → ваш аккаунт → проект `messenger-android`
2. **Credentials** → **Android** → `com.ivaexpi.messengerandroid`
3. На открывшейся странице найти раздел **Push notifications (FCM V1)** ← именно этот, не «EAS Submit»
4. Нажать **Upload a Google Service Account Key** → выбрать скачанный JSON-файл

> ⚠️ На странице идентификатора приложения два раздела:  
> `Push notifications (FCM V1)` — для уведомлений  
> `EAS Submit` — для публикации в Play Store  
> Ключ нужен в **первом** разделе.

---

## Каналы уведомлений Android

Настроены в `artifacts/messenger-android/services/notificationService.ts`:

| Channel ID | Название | Приоритет | Особенности |
|---|---|---|---|
| `calls` | Звонки | MAX | `bypassDnd: true`, виден на локскрине |
| `messages` | Сообщения | HIGH | Стандартные настройки |

---

## Таблицы в БД

### `push_tokens`

| Колонка | Тип | Описание |
|---|---|---|
| `user_id` | varchar(64) | PK, FK → `users.id` |
| `token` | text | `ExponentPushToken[…]` |
| `updated_at` | timestamptz | Время последней регистрации токена |

Один токен на пользователя — при каждом запуске приложения токен обновляется на месте (`upsert`).

### `users`

| Колонка | Тип | Описание |
|---|---|---|
| `id` | varchar(64) | PK |
| `name` | text | Отображаемое имя |
| `pin_hash` | text | Argon2 хеш PIN-кода |
| `is_blocked` | boolean | Заблокирован ли пользователь |
| `failed_attempts` | integer | Счётчик неверных попыток |
| `created_at` | timestamptz | Дата создания |

---

## Проверка токенов в БД

Подключиться к контейнеру PostgreSQL на VPS:

```bash
docker exec -it deploy-db-1 psql -U messenger -d messenger
```

**Все токены с именами пользователей:**
```sql
SELECT u.name, p.token, p.updated_at
FROM push_tokens p
JOIN users u ON u.id = p.user_id
ORDER BY p.updated_at DESC;
```

**Токен конкретного пользователя:**
```sql
SELECT p.token, p.updated_at
FROM push_tokens p
JOIN users u ON u.id = p.user_id
WHERE u.name = 'Иван';
```

**Пользователи без токена (не получат пуш):**
```sql
SELECT u.name
FROM users u
LEFT JOIN push_tokens p ON p.user_id = u.id
WHERE p.token IS NULL;
```

---

## Ручной тест пуша (без нашего сервера)

Позволяет изолировать проблему: если тест проходит, но пуши из приложения не приходят — проблема в нашем коде или деплое.

1. Взять токен из БД (запрос выше) или из логов устройства:
   ```bash
   adb logcat | grep "\[Push\]"
   # [Push] Token registered: ExponentPushToken[LlEPdRONXBe7Og…
   ```

2. Открыть [expo.dev/notifications](https://expo.dev/notifications)

3. Заполнить форму:
   - **Expo Push Token**: `ExponentPushToken[...]`
   - **Channel ID**: `calls`
   - **Title**: `Тест звонка`
   - **Body**: `Входящий звонок`

4. Нажать **Send notification**

**Ожидаемые результаты:**

| Ответ | Причина | Действие |
|---|---|---|
| Уведомление пришло ✅ | Цепочка работает | Проблема в коде сервера, проверить логи |
| `InvalidCredentials` | FCM V1 ключ не загружен или не в тот раздел | Перезагрузить ключ в раздел **Push notifications** |
| `DeviceNotRegistered` | Токен устарел | Переустановить приложение, взять новый токен |
| Пришло без звука/вибрации | Канал не создан | Проверить настройки Xiaomi ниже |

---

## Проверка логов сервера

```bash
# Последние 50 строк с фильтром по push
docker logs deploy-api-1 --tail=200 | grep push

# Следить в реальном времени во время тестового звонка
docker logs -f deploy-api-1 | grep push
```

**Что должно появляться при звонке:**

```
push: ticket ok — Expo accepted        ← Expo принял запрос
push: receipt ok — delivered to FCM/APNs  ← FCM подтвердил доставку (через ~30 сек)
```

**Плохие варианты:**

```
push: receipt error — InvalidCredentials  ← FCM V1 ключ не настроен
push: receipt error — DeviceNotRegistered ← токен устарел, нужно обновить в БД
push: send response had unexpected shape  ← Expo вернул неожиданный формат (сетевая проблема)
push: skipping non-Expo token             ← в БД сохранён некорректный токен
```

---

## Настройки Xiaomi MIUI (обязательно)

MIUI агрессивно блокирует фоновые процессы. Без этих настроек уведомления не доходят даже при исправной цепочке.

| Настройка | Путь | Значение |
|---|---|---|
| Автозапуск | Безопасность → Разрешения → Автозапуск | ✅ Включён |
| Батарея | Настройки → Приложения → [app] → Батарея | **Без ограничений** |
| Закрепить в рецентах | Рецентс → долгое нажатие на карточку | 🔒 Замок |
| Канал «Звонки» | Настройки → Уведомления → [app] → Звонки | Приоритет: **Срочные** |
| Режим «Не беспокоить» | — | Выключен или разрешить для приложения |

---

## Обновление сервера на VPS

После изменений в коде `api-server` обычно достаточно обновить только контейнер
API — останавливать PostgreSQL, nginx и coturn не нужно:

```bash
cd /path/to/project/deploy
git pull
docker compose up -d --build api
docker compose ps
curl https://chat.example.com/api/v1/health
```

Проверить, что новая версия запустилась:

```bash
docker compose logs --tail=20 api
# Должна быть строка: "Server listening at http://0.0.0.0:3000"
```

Для остальных случаев используйте таблицу и безопасный полный сценарий в
[`deploy/README.md`](../deploy/README.md#универсальная-инструкция-после-изменений):
`nginx` — только nginx, `coturn` — только coturn, изменения Compose/Dockerfile —
`docker compose up -d --build`. Полный `docker compose down` нужен только при
изменениях сети/монтирований или если обычный `up` не применяет конфигурацию.
`docker compose down -v` для обновлений не используйте.

---

# English Version

# Push Notifications: Setup, Diagnostics, Testing

**[Русская версия](#push-уведомления-настройка-диагностика-проверка)**

## Table of Contents

- [How Delivery Works](#how-delivery-works)
- [Configure FCM V1 Service Account Key on expo.dev](#configure-fcm-v1-service-account-key-on-expodev)
  - [1. Create Key in Firebase Console](#1-create-key-in-firebase-console)
  - [2. Upload Key to Expo](#2-upload-key-to-expo)
- [Android Notification Channels](#android-notification-channels)
- [Database Tables](#database-tables)
  - [`push_tokens`](#push_tokens)
  - [`users`](#users)
- [Verify Tokens in DB](#verify-tokens-in-db)
- [Manual Push Test (without our server)](#manual-push-test-without-our-server)
- [Check Server Logs](#check-server-logs)
- [Xiaomi MIUI Settings (mandatory)](#xiaomi-miui-settings-mandatory)
- [Update Server on VPS](#update-server-on-vps)

## How Delivery Works

```
api-server
  → POST https://exp.host/--/api/v2/push/send   (ExponentPushToken)
    → Expo Push Service
      → Google FCM
        → Android device
```

Expo participates in **two independent processes**:

| Process | Where Configured |
|---|---|
| APK Build | GitHub Actions (`google-services.json` from secret `GOOGLE_SERVICES_JSON`) |
| Push Delivery | expo.dev → Credentials → FCM V1 Service Account Key |

`google-services.json` in APK allows **device to receive** notifications. FCM V1 Service Account Key on expo.dev allows **Expo to send** them via Google FCM. Both are needed.

---

## Configure FCM V1 Service Account Key on expo.dev

### 1. Create Key in Firebase Console

1. Open [console.firebase.google.com](https://console.firebase.google.com) → your project (`family-messenger`)
2. ⚙️ → **Project settings** → **Service accounts** tab
3. Click **Generate new private key** → downloads `family-messenger-xxxx-firebase-adminsdk-xxxx.json`

### 2. Upload Key to Expo

1. Open [expo.dev](https://expo.dev) → your account → project `messenger-android`
2. **Credentials** → **Android** → `com.ivaexpi.messengerandroid`
3. On opened page find **Push notifications (FCM V1)** section ← exactly this one, not "EAS Submit"
4. Click **Upload a Google Service Account Key** → select downloaded JSON file

> ⚠️ On app identifier page there are two sections:  
> `Push notifications (FCM V1)` — for notifications  
> `EAS Submit` — for Play Store publishing  
> Key needed in **first** section.

---

## Android Notification Channels

Configured in `artifacts/messenger-android/services/notificationService.ts`:

| Channel ID | Name | Priority | Features |
|---|---|---|---|
| `calls` | Calls | MAX | `bypassDnd: true`, visible on lock screen |
| `messages` | Messages | HIGH | Standard settings |

---

## Database Tables

### `push_tokens`

| Column | Type | Description |
|---|---|---|
| `user_id` | varchar(64) | PK, FK → `users.id` |
| `token` | text | `ExponentPushToken[…]` |
| `updated_at` | timestamptz | Last token registration time |

One token per user — updated in place (`upsert`) on each app launch.

### `users`

| Column | Type | Description |
|---|---|---|
| `id` | varchar(64) | PK |
| `name` | text | Display name |
| `pin_hash` | text | Argon2 PIN hash |
| `is_blocked` | boolean | Is user blocked |
| `failed_attempts` | integer | Failed attempts counter |
| `created_at` | timestamptz | Creation date |

---

## Verify Tokens in DB

Connect to PostgreSQL container on VPS:

```bash
docker exec -it deploy-db-1 psql -U messenger -d messenger
```

**All tokens with user names:**
```sql
SELECT u.name, p.token, p.updated_at
FROM push_tokens p
JOIN users u ON u.id = p.user_id
ORDER BY p.updated_at DESC;
```

**Specific user's token:**
```sql
SELECT p.token, p.updated_at
FROM push_tokens p
JOIN users u ON u.id = p.user_id
WHERE u.name = 'Ivan';
```

**Users without token (won't receive push):**
```sql
SELECT u.name
FROM users u
LEFT JOIN push_tokens p ON p.user_id = u.id
WHERE p.token IS NULL;
```

---

## Manual Push Test (without our server)

Isolates issue: if test passes but app pushes don't arrive — problem in our code or deploy.

1. Get token from DB (query above) or from device logs:
   ```bash
   adb logcat | grep "\[Push\]"
   # [Push] Token registered: ExponentPushToken[LlEPdRONXBe7Og…
   ```

2. Open [expo.dev/notifications](https://expo.dev/notifications)

3. Fill form:
   - **Expo Push Token**: `ExponentPushToken[...]`
   - **Channel ID**: `calls`
   - **Title**: `Test Call`
   - **Body**: `Incoming call`

4. Click **Send notification**

**Expected Results:**

| Response | Reason | Action |
|---|---|---|
| Notification arrived ✅ | Chain works | Problem in server code, check logs |
| `InvalidCredentials` | FCM V1 key not uploaded or wrong section | Re-upload key to **Push notifications** section |
| `DeviceNotRegistered` | Token expired | Reinstall app, get new token |
| Arrived without sound/vibration | Channel not created | Check Xiaomi settings below |

---

## Check Server Logs

```bash
# Last 50 lines filtered by push
docker logs deploy-api-1 --tail=200 | grep push

# Watch in real time during test call
docker logs -f deploy-api-1 | grep push
```

**What should appear on call:**

```
push: ticket ok — Expo accepted        ← Expo accepted request
push: receipt ok — delivered to FCM/APNs  ← FCM confirmed delivery (~30 sec)
```

**Bad variants:**

```
push: receipt error — InvalidCredentials  ← FCM V1 key not configured
push: receipt error — DeviceNotRegistered ← token expired, update in DB
push: send response had unexpected shape  ← Expo returned unexpected format (network issue)
push: skipping non-Expo token             ← invalid token stored in DB
```

---

## Xiaomi MIUI Settings (mandatory)

MIUI aggressively blocks background processes. Without these settings notifications won't arrive even with working chain.

| Setting | Path | Value |
|---|---|---|
| Auto-start | Security → Permissions → Auto-start | ✅ Enabled |
| Battery | Settings → Apps → [app] → Battery | **No restrictions** |
| Pin in recents | Recents → long press card | 🔒 Lock |
| "Calls" channel | Settings → Notifications → [app] → Calls | Priority: **Urgent** |
| Do Not Disturb mode | — | Off or allow for app |

---

## Update Server on VPS

After `api-server` code changes usually just update API container — no need to stop PostgreSQL, nginx, coturn:

```bash
cd /path/to/project/deploy
git pull
docker compose up -d --build api
docker compose ps
curl https://chat.example.com/api/v1/health
```

Verify new version started:

```bash
docker compose logs --tail=20 api
# Should show: "Server listening at http://0.0.0.0:3000"
```

For other cases use table and safe full scenario in [`deploy/README.md`](../deploy/README.md#универсальная-инструкция-после-изменений):
`nginx` — only nginx, `coturn` — only coturn, Compose/Dockerfile changes — `docker compose up -d --build`. Full `docker compose down` only when network/mounts changed or regular `up` doesn't apply config. Don't use `docker compose down -v` for updates.
