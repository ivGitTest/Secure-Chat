# API Reference

**Base URL:** `https://<your-domain>`  
**WebSocket:** `wss://<your-domain>/ws`  
**Transport:** JSON over HTTPS / WSS  
**Auth:** Bearer JWT в заголовке `Authorization: Bearer <token>` (HTTP) и том же заголовке при WebSocket-апгрейде.

---

## Оглавление

- [HTTP эндпоинты](#http-эндпоинты)
  - [Служебные (без авторизации)](#служебные-без-авторизации)
    - [`GET /healthz`](#get-healthz)
    - [`GET /api/v1/health`](#get-apiv1health)
  - [Аутентификация](#аутентификация)
    - [`POST /api/v1/auth/login`](#post-apiv1authlogin)
    - [`POST /api/v1/auth/logout`](#post-apiv1authlogout)
  - [Пользователи](#пользователи)
    - [`GET /api/v1/users`](#get-apiv1users)
    - [`GET /api/v1/users/me`](#get-apiv1usersme)
  - [Разговоры](#разговоры)
    - [`GET /api/v1/conversations`](#get-apiv1conversations)
    - [`GET /api/v1/conversations/:id/messages`](#get-apiv1conversationsidmessages)
  - [Конфигурация](#конфигурация)
    - [`GET /api/v1/config`](#get-apiv1config)
- [WebSocket (`/ws`)](#websocket-ws)
  - [Клиент → Сервер](#клиент--сервер)
  - [Сервер → Клиент](#сервер--клиент)
    - [Коды ошибок WebSocket](#коды-ошибок-websocket)
- [Сессии и безопасность](#сессии-и-безопасность)
- [Модель данных (основные таблицы)](#модель-данных-основные-таблицы)

## HTTP эндпоинты

### Служебные (без авторизации)

#### `GET /healthz`
#### `GET /api/v1/health`
Проверка доступности сервера.

**Ответ `200`**
```json
{ "status": "ok" }
```

---

### Аутентификация

#### `POST /api/v1/auth/login`
Вход по PIN-коду. Возвращает JWT-токен.

**Тело запроса**
```json
{ "userId": "alexey_petrov", "pin": "4829" }
```

**Ответ `200`**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "alexey_petrov",
    "name": "Алексей"
  }
}
```

**Ошибки**
| Код | Причина |
|-----|---------|
| `404` | Пользователь не найден |
| `401` | Неверный PIN |
| `403` | Пользователь заблокирован |

---

#### `POST /api/v1/auth/logout`
Инвалидирует сессию. Требует авторизации.

**Ответ `204`** — тело пустое.

---

### Пользователи

#### `GET /api/v1/users`
Список всех участников семьи. Требует авторизации.

**Ответ `200`**
```json
[
  { "id": "alexey_petrov", "name": "Алексей" },
  { "id": "marina_sokolova", "name": "Марина" }
]
```

Поддерживает `ETag` / `304 Not Modified`.

---

#### `GET /api/v1/users/me`
Профиль текущего пользователя. Требует авторизации.

**Ответ `200`**
```json
{ "id": "alexey_petrov", "name": "Алексей" }
```

---

### Разговоры

#### `GET /api/v1/conversations`
Список активных чатов пользователя. Требует авторизации.

**Ответ `200`**
```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "createdAt": "2026-01-01T10:00:00.000Z",
    "participants": ["alexey_petrov", "marina_sokolova"]
  }
]
```

---

#### `GET /api/v1/conversations/:id/messages`
История сообщений в порядке «старые → новые». Требует авторизации.

**Ответ `200`**
```json
[
  {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "conversationId": "a1b2c3d4-...",
    "senderId": "alexey_petrov",
    "text": "Привет!",
    "createdAt": "2026-01-01T10:05:00.000Z"
  }
]
```

---

### Конфигурация

#### `GET /api/v1/config`
Возвращает адреса STUN/TURN-серверов для WebRTC. Требует авторизации.

**Ответ `200`**
```json
{
  "stunServers": ["stun:<your-domain>:3478"],
  "turnServers": ["turn:<your-domain>:3478"],
  "turnRealm": "<your-domain>"
}
```

---

## WebSocket (`/ws`)

Подключение: HTTP-апгрейд с заголовком `Authorization: Bearer <token>`.  
Формат каждого фрейма:

```json
{
  "type": "<event_type>",
  "payload": { ... },
  "timestamp": "2026-01-01T10:05:00.000Z"
}
```

### Клиент → Сервер

| Тип | Назначение | Ключи payload |
|-----|-----------|---------------|
| `message.send` | Отправить сообщение | `text`, `conversationId` **или** `recipientId`, опционально `clientId` (UUID, idempotency key) |
| `message.ack` | Подтвердить получение | `messageId` |
| `ping` | Keep-alive | — |
| `call.invite` | Инициировать звонок | `calleeId` |
| `call.accept` | Принять звонок | `callId` |
| `call.reject` | Отклонить звонок | `callId` |
| `call.end` | Завершить звонок | `callId` |
| `webrtc.offer` | SDP offer | `callId`, `sdp` |
| `webrtc.answer` | SDP answer | `callId`, `sdp` |
| `webrtc.iceCandidate` | ICE кандидат | `callId`, `candidate` |

### Сервер → Клиент

| Тип | Назначение | Ключи payload |
|-----|-----------|---------------|
| `message.new` | Входящее сообщение | `id`, `conversationId`, `senderId`, `text`, `createdAt` |
| `message.delivered` | Подтверждение отправки | `messageId`, `clientId` (если передавался) |
| `call.incoming` | Входящий звонок | `callId`, `callerId`, `callerName` |
| `call.accept` | Звонок принят | `callId` |
| `call.reject` | Звонок отклонён | `callId` |
| `call.end` | Звонок завершён | `callId` |
| `webrtc.offer` / `webrtc.answer` / `webrtc.iceCandidate` | WebRTC сигналинг | `callId`, данные |
| `pong` | Ответ на ping | — |
| `error` | Ошибка | `code`, `message` |

#### Коды ошибок WebSocket

| Код WS close | Значение |
|-------------|---------|
| `4401` | Не авторизован / токен истёк |
| `4000` | Соединение вытеснено новым подключением того же пользователя |
| `4500` | Внутренняя ошибка сервера |

---

## Сессии и безопасность

- JWT-токен имеет срок жизни, задаваемый через `JWT_EXPIRES_IN` (по умолчанию `7d`).
- На каждого пользователя разрешено **одно активное WebSocket-соединение**: новое вытесняет старое (код `4000`).
- После 5 неверных PIN-попыток (логика на уровне приложения) пользователь блокируется.

---

## Модель данных (основные таблицы)

```
users           — участники семьи (id, name, pin_hash, is_blocked)
sessions        — активные JWT-сессии (id, user_id, expires_at)
conversations   — чаты (id, created_at)
participants    — связь user ↔ conversation
messages        — сообщения (id, conversation_id, sender_id, text, client_id, created_at)
call_logs       — история звонков (id, caller_id, callee_id, started_at, duration_s)
```
