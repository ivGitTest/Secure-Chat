# Push-уведомления: настройка, диагностика, проверка

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
curl https://chat.naviry.xyz/api/v1/health
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
