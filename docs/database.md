# База данных — справочник таблиц

ORM: **Drizzle ORM**, СУБД: **PostgreSQL**.  
Схема: `lib/db/src/schema/`. Миграции применяются через `drizzle-kit push`.

---

## Оглавление

- [Таблицы](#таблицы)
  - [`users` — пользователи](#users--пользователи)
  - [`conversations` — беседы](#conversations--беседы)
  - [`participants` — участники бесед (many-to-many)](#participants--участники-бесед-many-to-many)
  - [`messages` — сообщения](#messages--сообщения)
  - [`sessions` — активные сессии](#sessions--активные-сессии)
  - [`devices` — зарегистрированные устройства](#devices--зарегистрированные-устройства)
  - [`push_tokens` — токены push-уведомлений](#push_tokens--токены-push-уведомлений)
  - [`call_logs` — журнал звонков](#call_logs--журнал-звонков)
- [ER-схема (текстовая)](#er-схема-текстовая)
- [Подключение для ручных запросов](#подключение-для-ручных-запросов)

## Таблицы

### `users` — пользователи

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `varchar(64)` | PK | — |
| `name` | `text` | NOT NULL | — |
| `pin_hash` | `text` | NOT NULL | — |
| `is_blocked` | `boolean` | NOT NULL | `false` |
| `failed_attempts` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

`id` задаётся вручную при создании пользователя (короткий читаемый slug, например `mama`).  
`pin_hash` — хеш Argon2 четырёхзначного PIN-кода.

```sql
-- Все пользователи
SELECT id, name, is_blocked, failed_attempts, created_at
FROM users
ORDER BY created_at;

-- Заблокированные
SELECT id, name, failed_attempts
FROM users
WHERE is_blocked = true;

-- Сбросить счётчик неудачных попыток
UPDATE users SET failed_attempts = 0, is_blocked = false WHERE id = 'mama';
```

---

### `conversations` — беседы

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

Беседа — просто контейнер. Участники хранятся в `participants`, сообщения — в `messages`.

```sql
-- Все беседы с количеством участников
SELECT c.id, c.created_at, COUNT(p.user_id) AS participants
FROM conversations c
JOIN participants p ON p.conversation_id = c.id
GROUP BY c.id
ORDER BY c.created_at;
```

---

### `participants` — участники бесед (many-to-many)

| Колонка | Тип | Ограничения |
|---|---|---|
| `conversation_id` | `uuid` | PK(1/2), FK → `conversations.id` CASCADE |
| `user_id` | `varchar(64)` | PK(2/2), FK → `users.id` CASCADE |

```sql
-- Беседы конкретного пользователя
SELECT c.id AS conversation_id, c.created_at
FROM conversations c
JOIN participants p ON p.conversation_id = c.id
WHERE p.user_id = 'mama';

-- Участники конкретной беседы
SELECT u.id, u.name
FROM users u
JOIN participants p ON p.user_id = u.id
WHERE p.conversation_id = '<uuid>';

-- Найти беседу между двумя пользователями
SELECT p1.conversation_id
FROM participants p1
JOIN participants p2 ON p2.conversation_id = p1.conversation_id
WHERE p1.user_id = 'mama' AND p2.user_id = 'papa';
```

---

### `messages` — сообщения

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `conversation_id` | `uuid` | NOT NULL, FK → `conversations.id` CASCADE | — |
| `sender_id` | `varchar(64)` | NOT NULL, FK → `users.id` | — |
| `text` | `text` | NOT NULL | — |
| `client_id` | `text` | UNIQUE, nullable | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

`client_id` — ключ идемпотентности, генерируется клиентом; предотвращает дублирование при повторной отправке.

```sql
-- Последние 50 сообщений в беседе
SELECT m.id, m.sender_id, u.name AS sender_name, m.text, m.created_at
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = '<uuid>'
ORDER BY m.created_at DESC
LIMIT 50;

-- Пагинация: сообщения старше курсора
SELECT m.id, m.sender_id, m.text, m.created_at
FROM messages m
WHERE m.conversation_id = '<uuid>'
  AND m.created_at < '2026-07-29T10:00:00Z'
ORDER BY m.created_at DESC
LIMIT 50;

-- Количество сообщений по пользователям
SELECT sender_id, COUNT(*) AS total
FROM messages
GROUP BY sender_id
ORDER BY total DESC;
```

---

### `sessions` — активные сессии

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `user_id` | `varchar(64)` | NOT NULL, FK → `users.id` CASCADE | — |
| `expires_at` | `timestamptz` | NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

```sql
-- Активные сессии
SELECT s.id, s.user_id, u.name, s.expires_at
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.expires_at > now()
ORDER BY s.expires_at;

-- Просроченные сессии (для очистки)
SELECT COUNT(*) FROM sessions WHERE expires_at <= now();

-- Удалить просроченные
DELETE FROM sessions WHERE expires_at <= now();
```

---

### `devices` — зарегистрированные устройства

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `user_id` | `varchar(64)` | NOT NULL, FK → `users.id` CASCADE | — |
| `device_id` | `text` | NOT NULL | — |
| `registered_at` | `timestamptz` | NOT NULL | `now()` |

```sql
-- Устройства пользователя
SELECT id, device_id, registered_at
FROM devices
WHERE user_id = 'mama'
ORDER BY registered_at DESC;

-- Все устройства с именами владельцев
SELECT d.device_id, u.id AS user_id, u.name, d.registered_at
FROM devices d
JOIN users u ON u.id = d.user_id
ORDER BY d.registered_at DESC;
```

---

### `push_tokens` — токены push-уведомлений

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `user_id` | `varchar(64)` | PK, FK → `users.id` CASCADE | — |
| `token` | `text` | NOT NULL | — |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

Один токен на пользователя — при повторной регистрации перезаписывается.

```sql
-- Все актуальные токены
SELECT user_id, token, updated_at
FROM push_tokens
ORDER BY updated_at DESC;

-- Токен конкретного пользователя
SELECT token FROM push_tokens WHERE user_id = 'papa';
```

---

### `call_logs` — журнал звонков

| Колонка | Тип | Ограничения | По умолчанию |
|---|---|---|---|
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `caller_id` | `varchar(64)` | NOT NULL, FK → `users.id` | — |
| `callee_id` | `varchar(64)` | NOT NULL, FK → `users.id` | — |
| `started_at` | `timestamptz` | NOT NULL | — |
| `ended_at` | `timestamptz` | nullable | — |
| `duration_s` | `integer` | nullable | — |

`ended_at` и `duration_s` равны NULL для незавершённых (оборванных) звонков.

```sql
-- История звонков с именами
SELECT
  c.id,
  u1.name AS caller,
  u2.name AS callee,
  c.started_at,
  c.duration_s
FROM call_logs c
JOIN users u1 ON u1.id = c.caller_id
JOIN users u2 ON u2.id = c.callee_id
ORDER BY c.started_at DESC
LIMIT 20;

-- Незавершённые звонки (оборванные соединения)
SELECT id, caller_id, callee_id, started_at
FROM call_logs
WHERE ended_at IS NULL
  AND started_at < now() - INTERVAL '5 minutes';

-- Общая статистика звонков по пользователям
SELECT caller_id, COUNT(*) AS calls_made,
       SUM(duration_s) AS total_s
FROM call_logs
WHERE duration_s IS NOT NULL
GROUP BY caller_id
ORDER BY calls_made DESC;
```

---

## ER-схема (текстовая)

```
users (id PK)
 ├── sessions.user_id
 ├── devices.user_id
 ├── push_tokens.user_id (1:1)
 ├── participants.user_id ──→ conversations (id PK)
 │                               └── participants.conversation_id
 ├── messages.sender_id ──→ conversations.id (через conversation_id)
 ├── call_logs.caller_id
 └── call_logs.callee_id
```

---

## Подключение для ручных запросов

```bash
# Через Docker Compose (dev)
docker compose -f deploy/docker-compose.yml exec postgres \
  psql -U postgres -d messenger

# Или через переменную окружения DATABASE_URL
psql "$DATABASE_URL"
```
