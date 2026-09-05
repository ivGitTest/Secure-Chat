# Архитектура семейного мессенджера

**[English version](#english-version)**

## Оглавление

- [1. Компонентная диаграмма (deployment view)](#1-компонентная-диаграмма-deployment-view)
- [2. Схема базы данных](#2-схема-базы-данных)
- [3. Поток текстового сообщения](#3-поток-текстового-сообщения)
- [4. Поток VoIP-звонка](#4-поток-voip-звонка)
- [5. Сводная таблица протоколов](#5-сводная-таблица-протоколов)
- [6. Аутентификация и безопасность](#6-аутентификация-и-безопасность)

## 1. Компонентная диаграмма (deployment view)

```mermaid
graph TB
    subgraph CLIENT["📱 Android-клиент (React Native / Expo)"]
        direction TB
        UI["UI-слой\n(React Native)"]
        CTX["CallContext\n(JS, управление звонком)"]
        WRC["WebRTC\n(аудио/видео P2P)"]
        CK["react-native-callkeep\n(VoiceConnectionService)"]
        CFMS["CallFirebaseMessagingService\n(custom FCM handler, Java)"]
        CALS["CallAnswerListenerService\n(foreground service, Java)"]
        TM["Android TelecomManager\n(OS lock-screen call UI)"]

        UI --> CTX
        CTX --> WRC
        CTX --> CK
        CFMS -->|"addNewIncomingCall()"| TM
        CFMS -->|"startForegroundService()"| CALS
        CALS -->|"ACTION_ANSWER_CALL\n(LocalBroadcast)"| CTX
        TM --> CK
    end

    subgraph VPS["🖥️ VPS (Docker Compose)"]
        direction TB
        NGX["Nginx\n(reverse proxy + TLS)"]
        API["API Server\n(Express + WebSocket)\nNode.js 22"]
        DB[("PostgreSQL 16\n(Drizzle ORM)")]
        TURN["coturn\n(STUN/TURN server)\nhost network"]

        NGX -->|"HTTP proxy"| API
        API -->|"pg wire protocol"| DB
    end

    FCM["☁️ Firebase Cloud Messaging\n(FCM HTTP v1 API)"]

    %% Client ↔ VPS
    CLIENT -->|"HTTPS (REST)\nWSS (signaling)"| NGX
    NGX -->|"HTTPS / WSS"| API

    %% API → FCM → Client
    API -->|"HTTPS\nfirebase-admin SDK"| FCM
    FCM -->|"FCM data push\n(type=call / call_cancelled)"| CFMS

    %% WebRTC NAT traversal
    WRC -->|"STUN/TURN\nUDP 3478 / TLS 5349"| TURN
    WRC <-->|"WebRTC (DTLS-SRTP)\nаудио/видео P2P"| WRC2["WebRTC\nдругого участника"]

    style CLIENT fill:#e8f4f8,stroke:#2196F3,stroke-width:2px
    style VPS fill:#e8f8e8,stroke:#4CAF50,stroke-width:2px
    style FCM fill:#fff3e0,stroke:#FF9800,stroke-width:2px
```

---

## 2. Схема базы данных

```mermaid
erDiagram
    users {
        varchar id PK
        varchar username UK
        text display_name
        varchar password_hash
        text avatar_url
        boolean is_online
        integer unread_count
        timestamp created_at
    }

    sessions {
        uuid id PK
        varchar user_id FK
        varchar token_hash
        timestamp expires_at
        timestamp created_at
    }

    devices {
        uuid id PK
        varchar user_id FK
        text expo_push_token
        text fcm_token
        varchar platform
        timestamp updated_at
    }

    conversations {
        uuid id PK
        timestamp created_at
        timestamp last_message_at
    }

    participants {
        uuid conversation_id FK
        varchar user_id FK
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        varchar sender_id FK
        text content
        varchar type
        timestamp sent_at
        timestamp delivered_at
        timestamp read_at
    }

    call_logs {
        uuid id PK
        varchar caller_id FK
        varchar callee_id FK
        timestamp started_at
        timestamp ended_at
        integer duration_s
    }

    push_tokens {
        varchar user_id FK
        text expo_push_token
        text fcm_token
        timestamp updated_at
    }

    users ||--o{ sessions : "has"
    users ||--o{ devices : "registers"
    users ||--o{ participants : "joins"
    conversations ||--o{ participants : "has"
    conversations ||--o{ messages : "contains"
    users ||--o{ messages : "sends"
    users ||--o{ call_logs : "initiates/receives"
    users ||--o{ push_tokens : "has"
```

---

## 3. Поток текстового сообщения

```mermaid
sequenceDiagram
    actor Alice as 👤 Alice (отправитель)
    participant WS_A as WSS /ws
    participant API as API Server
    participant DB as PostgreSQL
    participant WS_B as WSS /ws
    actor Bob as 👤 Bob (получатель)

    Alice->>WS_A: {type:"message.send",\npayload:{convId, content}}
    WS_A->>API: handleMessage()
    API->>DB: INSERT messages
    DB-->>API: message record
    API-->>WS_A: {type:"message.sent", messageId, sentAt}
    WS_A-->>Alice: ✅ подтверждение

    alt Bob онлайн (WebSocket открыт)
        API->>WS_B: {type:"message.incoming", ...}
        WS_B-->>Bob: отображение сообщения
        Bob->>WS_B: {type:"message.ack", messageId}
        WS_B->>API: handleMessageAck()
        API->>DB: UPDATE delivered_at
    else Bob офлайн
        API->>DB: SELECT expo_push_token
        API->>API: sendPushNotification()\n(Expo Push API → FCM/APNs)
        Note over Bob: Push-уведомление появляется\nна устройстве
    end
```

---

## 4. Поток VoIP-звонка

```mermaid
sequenceDiagram
    actor Alice as 👤 Alice (звонящий)
    participant API as API Server\n(WebSocket)
    participant FCM as Firebase FCM
    participant CFMS as CallFirebaseMessagingService\n(Java, Android)
    participant TM as TelecomManager\n(Android OS)
    participant CTX as CallContext\n(JS / React Native)
    participant TURN as coturn\n(TURN/STUN)
    actor Bob as 👤 Bob (принимающий)

    %% ── Инициация звонка ────────────────────────────────────────────────────
    Alice->>API: WSS {type:"call.invite", calleeId}
    API->>API: создать CallState\n(callId = UUID)
    API-->>Alice: {type:"call.initiated", callId}

    %% ── Доставка входящего звонка ───────────────────────────────────────────
    alt Bob онлайн (WSS открыт)
        API->>Bob: WSS {type:"call.incoming", callerId, callId}
    else Bob офлайн / приложение убито
        API->>FCM: HTTPS POST\nfirebase-admin sendEachForMulticast()\ndata: {type:"call", callId, callerId, callerName}
        FCM->>CFMS: FCM data push (высокий приоритет)
        CFMS->>CFMS: writePendingCallFile()\n(callkeep_pending.json)
        CFMS->>TM: TelecomManager.addNewIncomingCall()
        TM->>Bob: Полноэкранный UI входящего звонка\n(lock-screen / ConnectionService)
        CFMS->>CFMS: startForegroundService\n(CallAnswerListenerService)
    end

    %% ── Ответ на звонок ─────────────────────────────────────────────────────
    Bob->>TM: нажать «Принять»
    TM->>CFMS: ACTION_ANSWER_CALL (LocalBroadcast)
    CFMS->>CFMS: callkeep_pending.json\n{answered: true}
    CFMS->>CTX: запуск MainActivity
    CTX->>CTX: readPendingCallFile()\nauto-accept
    Bob->>API: WSS {type:"call.accepted", callId}
    API-->>Alice: WSS {type:"call.accepted"}

    %% ── WebRTC handshake ────────────────────────────────────────────────────
    Note over Alice,Bob: WebRTC signaling через API (WSS)
    Alice->>API: WSS {type:"webrtc.offer", sdp}
    API->>Bob: WSS {type:"webrtc.offer", sdp}
    Bob->>API: WSS {type:"webrtc.answer", sdp}
    API->>Alice: WSS {type:"webrtc.answer", sdp}

    loop ICE candidates
        Alice->>API: WSS {type:"webrtc.iceCandidate", candidate}
        API->>Bob: WSS {type:"webrtc.iceCandidate", candidate}
        Bob->>API: WSS {type:"webrtc.iceCandidate", candidate}
        API->>Alice: WSS {type:"webrtc.iceCandidate", candidate}
    end

    %% ── STUN/TURN ───────────────────────────────────────────────────────────
    Alice->>TURN: STUN Binding Request (UDP 3478)
    TURN-->>Alice: Mapped Address (публичный IP:port)
    Bob->>TURN: STUN Binding Request
    TURN-->>Bob: Mapped Address

    alt Прямое P2P соединение возможно
        Alice-->>Bob: WebRTC DTLS-SRTP (аудио/видео, P2P)
    else NAT блокирует P2P
        Alice->>TURN: TURN Allocate (UDP/TCP 3478, TLS 5349)
        Bob->>TURN: TURN Allocate
        Alice-->>TURN: WebRTC DTLS-SRTP (relay)
        TURN-->>Bob: WebRTC DTLS-SRTP (relay)
    end

    %% ── Завершение ─────────────────────────────────────────────────────────
    Alice->>API: WSS {type:"call.end"}
    API-->>Bob: WSS {type:"call.end"}
    API->>DB: INSERT call_logs\n(callerId, calleeId, startedAt,\nendedAt, durationS)

    alt Bob не ответил (звонок сброшен)
        API->>FCM: HTTPS POST\ndata: {type:"call_cancelled", callId}
        FCM->>CFMS: FCM data push
        CFMS->>TM: connection.setDisconnected(MISSED)\n→ dismiss lock-screen UI
        CFMS->>CFMS: delete callkeep_pending.json
    end
```

---

## 5. Сводная таблица протоколов

| Направление | Протокол | Порт | Назначение |
|---|---|---|---|
| Client → Nginx | HTTPS | 443 | REST API (auth, messages, users, config) |
| Client → Nginx | WSS | 443 | WebSocket signaling (чат + звонки) |
| Nginx → API | HTTP | 7080 | Proxy внутри Docker-сети |
| API → PostgreSQL | pg wire | 5432 | ORM-запросы (Drizzle) |
| API → Firebase | HTTPS | 443 | firebase-admin SDK, FCM HTTP v1 |
| Firebase → Client | FCM | — | Push-уведомления, data-only call/cancel |
| Client → coturn | STUN/TURN | UDP 3478 | Обнаружение публичного адреса, relay |
| Client → coturn | TURN TLS | TCP 5349 | Зашифрованный TURN relay |
| Client ↔ Client | WebRTC (DTLS-SRTP) | ephemeral | Зашифрованный P2P аудио/видео |

## 6. Аутентификация и безопасность

```mermaid
graph LR
    subgraph Client
        A["SecureStore\n(JWT хранилище)"]
    end

    subgraph API
        B["POST /api/v1/auth/login\n→ argon2 verify"]
        C["JWT middleware\n(jsonwebtoken)"]
        D["WebSocket upgrade\n(?token=JWT в URL)"]
    end

    subgraph DB
        E["users.password_hash\n(argon2id)"]
        F["sessions table\n(token_hash, expires_at)"]
    end

    A -->|"Bearer JWT"| C
    A -->|"?token=JWT"| D
    B -->|"проверка"| E
    B -->|"INSERT session"| F
    C -->|"verify + SELECT"| F
    D --> C
```

> **Ключевые параметры безопасности:**
> - Пароли: **argon2id** (нативный модуль, не бандлится esbuild)
> - Токены: **JWT** (HS256), секрет из `SESSION_SECRET` / `JWT_SECRET`
> - TLS: терминация на Nginx (Let's Encrypt)
> - FCM push: прямо через firebase-admin SDK (не через Expo) для VoIP — гарантирует доставку на убитое приложение
> - WebRTC медиа: **DTLS-SRTP** (сквозное шифрование аудио/видео)
> - TURN: HMAC-SHA1 time-limited credentials (`TURN_SECRET`)

---

# English Version

# Family Messenger Architecture

**[Русская версия](#архитектура-семейного-мессенджера)**

## Table of Contents

- [1. Component Diagram (Deployment View)](#1-component-diagram-deployment-view)
- [2. Database Schema](#2-database-schema)
- [3. Text Message Flow](#3-text-message-flow)
- [4. VoIP Call Flow](#4-voip-call-flow)
- [5. Protocol Summary Table](#5-protocol-summary-table)
- [6. Authentication and Security](#6-authentication-and-security)

## 1. Component Diagram (Deployment View)

```mermaid
graph TB
    subgraph CLIENT["📱 Android Client (React Native / Expo)"]
        direction TB
        UI["UI Layer\n(React Native)"]
        CTX["CallContext\n(JS, call management)"]
        WRC["WebRTC\n(audio/video P2P)"]
        CK["react-native-callkeep\n(VoiceConnectionService)"]
        CFMS["CallFirebaseMessagingService\n(custom FCM handler, Java)"]
        CALS["CallAnswerListenerService\n(foreground service, Java)"]
        TM["Android TelecomManager\n(OS lock-screen call UI)"]

        UI --> CTX
        CTX --> WRC
        CTX --> CK
        CFMS -->|"addNewIncomingCall()"| TM
        CFMS -->|"startForegroundService()"| CALS
        CALS -->|"ACTION_ANSWER_CALL\n(LocalBroadcast)"| CTX
        TM --> CK
    end

    subgraph VPS["🖥️ VPS (Docker Compose)"]
        direction TB
        NGX["Nginx\n(reverse proxy + TLS)"]
        API["API Server\n(Express + WebSocket)\nNode.js 22"]
        DB[("PostgreSQL 16\n(Drizzle ORM)")]
        TURN["coturn\n(STUN/TURN server)\nhost network"]

        NGX -->|"HTTP proxy"| API
        API -->|"pg wire protocol"| DB
    end

    FCM["☁️ Firebase Cloud Messaging\n(FCM HTTP v1 API)"]

    %% Client ↔ VPS
    CLIENT -->|"HTTPS (REST)\nWSS (signaling)"| NGX
    NGX -->|"HTTPS / WSS"| API

    %% API → FCM → Client
    API -->|"HTTPS\nfirebase-admin SDK"| FCM
    FCM -->|"FCM data push\n(type=call / call_cancelled)"| CFMS

    %% WebRTC NAT traversal
    WRC -->|"STUN/TURN\nUDP 3478 / TLS 5349"| TURN
    WRC <-->|"WebRTC (DTLS-SRTP)\naudio/video P2P"| WRC2["WebRTC\nother participant"]

    style CLIENT fill:#e8f4f8,stroke:#2196F3,stroke-width:2px
    style VPS fill:#e8f8e8,stroke:#4CAF50,stroke-width:2px
    style FCM fill:#fff3e0,stroke:#FF9800,stroke-width:2px
```

---

## 2. Database Schema

```mermaid
erDiagram
    users {
        varchar id PK
        varchar username UK
        text display_name
        varchar password_hash
        text avatar_url
        boolean is_online
        integer unread_count
        timestamp created_at
    }

    sessions {
        uuid id PK
        varchar user_id FK
        varchar token_hash
        timestamp expires_at
        timestamp created_at
    }

    devices {
        uuid id PK
        varchar user_id FK
        text expo_push_token
        text fcm_token
        varchar platform
        timestamp updated_at
    }

    conversations {
        uuid id PK
        timestamp created_at
        timestamp last_message_at
    }

    participants {
        uuid conversation_id FK
        varchar user_id FK
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        varchar sender_id FK
        text content
        varchar type
        timestamp sent_at
        timestamp delivered_at
        timestamp read_at
    }

    call_logs {
        uuid id PK
        varchar caller_id FK
        varchar callee_id FK
        timestamp started_at
        timestamp ended_at
        integer duration_s
    }

    push_tokens {
        varchar user_id FK
        text expo_push_token
        text fcm_token
        timestamp updated_at
    }

    users ||--o{ sessions : "has"
    users ||--o{ devices : "registers"
    users ||--o{ participants : "joins"
    conversations ||--o{ participants : "has"
    conversations ||--o{ messages : "contains"
    users ||--o{ messages : "sends"
    users ||--o{ call_logs : "initiates/receives"
    users ||--o{ push_tokens : "has"
```

---

## 3. Text Message Flow

```mermaid
sequenceDiagram
    actor Alice as 👤 Alice (sender)
    participant WS_A as WSS /ws
    participant API as API Server
    participant DB as PostgreSQL
    participant WS_B as WSS /ws
    actor Bob as 👤 Bob (receiver)

    Alice->>WS_A: {type:"message.send",\npayload:{convId, content}}
    WS_A->>API: handleMessage()
    API->>DB: INSERT messages
    DB-->>API: message record
    API-->>WS_A: {type:"message.sent", messageId, sentAt}
    WS_A-->>Alice: ✅ confirmation

    alt Bob online (WebSocket open)
        API->>WS_B: {type:"message.incoming", ...}
        WS_B-->>Bob: display message
        Bob->>WS_B: {type:"message.ack", messageId}
        WS_B->>API: handleMessageAck()
        API->>DB: UPDATE delivered_at
    else Bob offline
        API->>DB: SELECT expo_push_token
        API->>API: sendPushNotification()\n(Expo Push API → FCM/APNs)
        Note over Bob: Push notification appears\non device
    end
```

---

## 4. VoIP Call Flow

```mermaid
sequenceDiagram
    actor Alice as 👤 Alice (caller)
    participant API as API Server\n(WebSocket)
    participant FCM as Firebase FCM
    participant CFMS as CallFirebaseMessagingService\n(Java, Android)
    participant TM as TelecomManager\n(Android OS)
    participant CTX as CallContext\n(JS / React Native)
    participant TURN as coturn\n(TURN/STUN)
    actor Bob as 👤 Bob (callee)

    %% ── Call Initiation ────────────────────────────────────────────────────
    Alice->>API: WSS {type:"call.invite", calleeId}
    API->>API: create CallState\n(callId = UUID)
    API-->>Alice: {type:"call.initiated", callId}

    %% ── Incoming Call Delivery ─────────────────────────────────────────────
    alt Bob online (WSS open)
        API->>Bob: WSS {type:"call.incoming", callerId, callId}
    else Bob offline / app killed
        API->>FCM: HTTPS POST\nfirebase-admin sendEachForMulticast()\ndata: {type:"call", callId, callerId, callerName}
        FCM->>CFMS: FCM data push (high priority)
        CFMS->>CFMS: writePendingCallFile()\n(callkeep_pending.json)
        CFMS->>TM: TelecomManager.addNewIncomingCall()
        TM->>Bob: Full-screen incoming call UI\n(lock-screen / ConnectionService)
        CFMS->>CFMS: startForegroundService\n(CallAnswerListenerService)
    end

    %% ── Call Answer ────────────────────────────────────────────────────────
    Bob->>TM: press "Accept"
    TM->>CFMS: ACTION_ANSWER_CALL (LocalBroadcast)
    CFMS->>CFMS: callkeep_pending.json\n{answered: true}
    CFMS->>CTX: launch MainActivity
    CTX->>CTX: readPendingCallFile()\nauto-accept
    Bob->>API: WSS {type:"call.accepted", callId}
    API-->>Alice: WSS {type:"call.accepted"}

    %% ── WebRTC Handshake ───────────────────────────────────────────────────
    Note over Alice,Bob: WebRTC signaling via API (WSS)
    Alice->>API: WSS {type:"webrtc.offer", sdp}
    API->>Bob: WSS {type:"webrtc.offer", sdp}
    Bob->>API: WSS {type:"webrtc.answer", sdp}
    API->>Alice: WSS {type:"webrtc.answer", sdp}

    loop ICE candidates
        Alice->>API: WSS {type:"webrtc.iceCandidate", candidate}
        API->>Bob: WSS {type:"webrtc.iceCandidate", candidate}
        Bob->>API: WSS {type:"webrtc.iceCandidate", candidate}
        API->>Alice: WSS {type:"webrtc.iceCandidate", candidate}
    end

    %% ── STUN/TURN ──────────────────────────────────────────────────────────
    Alice->>TURN: STUN Binding Request (UDP 3478)
    TURN-->>Alice: Mapped Address (public IP:port)
    Bob->>TURN: STUN Binding Request
    TURN-->>Bob: Mapped Address

    alt Direct P2P connection possible
        Alice-->>Bob: WebRTC DTLS-SRTP (audio/video, P2P)
    else NAT blocks P2P
        Alice->>TURN: TURN Allocate (UDP/TCP 3478, TLS 5349)
        Bob->>TURN: TURN Allocate
        Alice-->>TURN: WebRTC DTLS-SRTP (relay)
        TURN-->>Bob: WebRTC DTLS-SRTP (relay)
    end

    %% ── Call End ───────────────────────────────────────────────────────────
    Alice->>API: WSS {type:"call.end"}
    API-->>Bob: WSS {type:"call.end"}
    API->>DB: INSERT call_logs\n(callerId, calleeId, startedAt,\nendedAt, durationS)

    alt Bob didn't answer (call cancelled)
        API->>FCM: HTTPS POST\ndata: {type:"call_cancelled", callId}
        FCM->>CFMS: FCM data push
        CFMS->>TM: connection.setDisconnected(MISSED)\n→ dismiss lock-screen UI
        CFMS->>CFMS: delete callkeep_pending.json
    end
```

---

## 5. Protocol Summary Table

| Direction | Protocol | Port | Purpose |
|---|---|---|---|
| Client → Nginx | HTTPS | 443 | REST API (auth, messages, users, config) |
| Client → Nginx | WSS | 443 | WebSocket signaling (chat + calls) |
| Nginx → API | HTTP | 7080 | Proxy inside Docker network |
| API → PostgreSQL | pg wire | 5432 | ORM queries (Drizzle) |
| API → Firebase | HTTPS | 443 | firebase-admin SDK, FCM HTTP v1 |
| Firebase → Client | FCM | — | Push notifications, data-only call/cancel |
| Client → coturn | STUN/TURN | UDP 3478 | Public address discovery, relay |
| Client → coturn | TURN TLS | TCP 5349 | Encrypted TURN relay |
| Client ↔ Client | WebRTC (DTLS-SRTP) | ephemeral | Encrypted P2P audio/video |

## 6. Authentication and Security

```mermaid
graph LR
    subgraph Client
        A["SecureStore\n(JWT storage)"]
    end

    subgraph API
        B["POST /api/v1/auth/login\n→ argon2 verify"]
        C["JWT middleware\n(jsonwebtoken)"]
        D["WebSocket upgrade\n(?token=JWT in URL)"]
    end

    subgraph DB
        E["users.password_hash\n(argon2id)"]
        F["sessions table\n(token_hash, expires_at)"]
    end

    A -->|"Bearer JWT"| C
    A -->|"?token=JWT"| D
    B -->|"verify"| E
    B -->|"INSERT session"| F
    C -->|"verify + SELECT"| F
    D --> C
```

> **Key Security Parameters:**
> - Passwords: **argon2id** (native module, not bundled by esbuild)
> - Tokens: **JWT** (HS256), secret from `SESSION_SECRET` / `JWT_SECRET`
> - TLS: termination on Nginx (Let's Encrypt)
> - FCM push: direct via firebase-admin SDK (not via Expo) for VoIP — guarantees delivery to killed app
> - WebRTC media: **DTLS-SRTP** (end-to-end audio/video encryption)
> - TURN: HMAC-SHA1 time-limited credentials (`TURN_SECRET`)
