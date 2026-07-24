# API Reference

**Base URL:** `https://chat.naviry.xyz`  
**WebSocket:** `wss://chat.naviry.xyz/ws`  
**Transport:** JSON over HTTPS / WSS  
**Auth:** Bearer JWT в заголовке `Authorization: Bearer <token>` (HTTP) и том же заголовке при WebSocket-апгрейде.

---

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
{ "userId": "ivan_rybakov", "pin": "111111" }
```

**Ответ `200`**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "ivan_rybakov",
    "name": "Иван"
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
  { "id": "ivan_rybakov", "name": "Иван" },
  { "id": "larisa_rybakova", "name": "Лариса" }
]
```

Поддерживает `ETag` / `304 Not Modified`.

---

#### `GET /api/v1/users/me`
Профиль текущего пользователя. Требует авторизации.

**Ответ `200`**
```json
{ "id": "ivan_rybakov", "name": "Иван" }
```

---

### Разговоры

#### `GET /api/v1/conversations`
Список активных чатов пользователя. Требует авторизации.

**Ответ `200`**
```json
[
  {
    "id": "9f11f491-a54a-40d6-82f9-aa2c9fbc117b",
    "createdAt": "2026-07-24T20:00:00.000Z",
    "participants": ["ivan_rybakov", "larisa_rybakova"]
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
    "id": "fde51324-2f46-471b-8069-4e634a1a2d0a",
    "conversationId": "9f11f491-...",
    "senderId": "ivan_rybakov",
    "text": "Привет!",
    "createdAt": "2026-07-24T22:43:12.000Z"
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
  "stunServers": ["stun:chat.naviry.xyz:3478"],
  "turnServers": ["turn:chat.naviry.xyz:3478"],
  "turnRealm": "naviry.xyz"
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
  "timestamp": "2026-07-24T22:43:12.000Z"
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
