# VoIP-уведомления для звонков

**[English version](#english-version)**

Документ описывает архитектуру системных уведомлений о входящих звонках — «как у Telegram».

---

## Оглавление

- [Как это работает](#как-это-работает)
  - [Два пути доставки входящего звонка](#два-пути-доставки-входящего-звонка)
  - [Состояния приложения](#состояния-приложения)
- [Компоненты](#компоненты)
  - [Клиент (Android приложение)](#клиент-android-приложение)
    - [Нативный слой (Java, генерируется плагинами `expo prebuild`)](#нативный-слой-java-генерируется-плагинами-expo-prebuild)
    - [Почему не используется headless JS для звонков](#почему-не-используется-headless-js-для-звонков)
    - [File-based call info persistence](#file-based-call-info-persistence)
    - [JS/TS слой](#jsts-слой)
  - [Сервер (API)](#сервер-api)
- [Конфигурация VPS](#конфигурация-vps)
  - [Переменная окружения `FIREBASE_SERVICE_ACCOUNT_JSON`](#переменная-окружения-firebase_service_account_json)
- [Требования от пользователя (одноразово)](#требования-от-пользователя-одноразово)
- [Как собрать APK с VoIP-поддержкой](#как-собрать-apk-с-voip-поддержкой)
- [Что НЕ нужно делать вручную](#что-не-нужно-делать-вручную)

## Как это работает

### Два пути доставки входящего звонка

```
Сервер
  │
  ├─ WebSocket (app active/background)
  │    └── call.incoming { callId, callerId }
  │         └── CallContext.tsx → показывает внутренний UI звонка
  │              └── react-native-callkeep → Android ConnectionService
  │                   └── Системный экран вызова
  │
  └─ FCM data-only push (priority: high) → wakes killed app
       └── CallFirebaseMessagingService.onMessageReceived() [native Java]
            ├── Регистрирует PhoneAccount в TelecomManager
            ├── Пишет callkeep_pending.json в getFilesDir()
            ├── Регистрирует pre-answer BroadcastReceiver (синхронно)
            ├── TelecomManager.addNewIncomingCall() → системный экран вызова
            └── startForegroundService(CallAnswerListenerService)
```

### Состояния приложения

| Состояние | Что получает звонящий | Результат |
|---|---|---|
| Активно | WS | Системный экран через CallKeep |
| В фоне | FCM data push → onMessageReceived | Системный экран вызова |
| Убито | FCM data push → onMessageReceived | Full-screen вызов на lock screen |
| Экран заблокирован | FCM data push → onMessageReceived | Full-screen вызов на lock screen |

---

## Компоненты

### Клиент (Android приложение)

#### Нативный слой (Java, генерируется плагинами `expo prebuild`)

**`CallFirebaseMessagingService.java`** (`plugins/withFirebaseCallService.js`)

Единственный `FirebaseMessagingService` зарегистрированный для
`com.google.firebase.MESSAGING_EVENT`. При получении FCM push:

- `type=call`:
  1. Строит `PhoneAccountHandle` из `ApplicationContext` (Activity не нужен).
  2. Регистрирует `PhoneAccount` с `CAPABILITY_CALL_PROVIDER` через `TelecomManager`.
  3. Вызывает `VoiceConnectionService.setPhoneAccountHandle()` для JS-слоя.
  4. Пишет `callkeep_pending.json` в `getFilesDir()` с callId/callerId/callerName/arrivedAt.
  5. Синхронно регистрирует `preAnswerReceiver` в `LocalBroadcastManager`
     **до** `addNewIncomingCall()` — гарантирует перехват ответа без гонки.
  6. `TelecomManager.addNewIncomingCall()` → системный экран вызова.
  7. `startForegroundService(CallAnswerListenerService)` — держит процесс живым.

- `type=call_cancelled`:
  1. `VoiceConnectionService.getConnection(callId).setDisconnected(MISSED).destroy()`
     — закрывает системный экран.
  2. Удаляет `callkeep_pending.json`.

- Все остальные типы: передаёт в `ReactNativeFirebaseMessagingHeadlessService`
  для обработки JS `setBackgroundMessageHandler`.

**`CallAnswerListenerService.java`** (`plugins/withFirebaseCallService.js`)

Foreground-сервис (`foregroundServiceType="shortService"`), запускается сразу после
`addNewIncomingCall()`. Регистрирует резервный `LocalBroadcastManager` receiver
для `ACTION_ANSWER_CALL`/`ACTION_END_CALL`:
- Ответ: дублирует пометку файла answered=true + запускает MainActivity.
  (Основной pre-answer receiver в сервисе обычно уже обработал это.)
- Отбой до ответа: завершает себя (`stopSelf()`).
- Auto-stop через 65 с (TTL звонка + буфер) для исключения утечки сервиса.

#### Почему не используется headless JS для звонков

`react-native-callkeep` требует `RNCallKeepModule.registerPhoneAccount()`, который
обращается к `reactContext.getCurrentActivity()`. В headless-процессе (убитый app)
Activity равно null — CallKeep не инициализируется и `displayIncomingCall()` — no-op.

Нативный `TelecomManager.addNewIncomingCall()` не требует Activity — работает из
любого `Context`, включая `Service`.

#### File-based call info persistence

Вместо AsyncStorage используется файл `callkeep_pending.json` в `getFilesDir()`:
- Пишется нативным Java-кодом до показа системного экрана.
- Читается JS (`expo-file-system`, `FileSystem.documentDirectory`) при монтировании `CallContext`.
- Поле `answered: true` выставляется после ответа пользователя (pre-answer receiver или CallAnswerListenerService).
- `CallContext.tsx` при монтировании:
  - `answered === true` → вызывает `acceptCall()` напрямую (не ждёт CallKeep события).
  - `answered === false/absent` → ставит `incomingCall` и ждёт `onAnswerCall`.

**`MicrophoneForegroundService.java`** (`plugins/withMicrophoneCallService.js`)

Foreground-сервис с `foregroundServiceType="microphone"` (Android 11+). Не даёт ОС
отключить микрофон при сворачивании/блокировке во время звонка.
- JS: `NativeModules.MicrophoneCallService.start(callerName)` / `.stop()`.
- Запускается в `acceptCall()` и `makeCall()`, останавливается в `cleanupCall()`.

**`withCallKeep.js`**

Регистрирует `VoiceConnectionService` как `android.telecom.ConnectionService` —
обязательный компонент Android Telecom API.
- Намеренно не использует `foregroundServiceType` в конфиге CallKeep (предотвращает
  NPE в killed-app пути где `RNCallKeepModule.instance` == null).

#### JS/TS слой

**`services/callkeepService.ts`**
- Обёртка над `react-native-callkeep`.
- Буферизует события до монтирования `CallContext`.
- `setupCallKeep()` вызывается в `app/_layout.tsx`.

**`context/CallContext.tsx`**
- Читает `callkeep_pending.json` при монтировании.
- При WS `call.incoming`: показывает внутренний UI.
- При `onAnswerCall` (или `answered=true` в файле): `acceptCall()` → WebRTC + WS `call.accept`.
- При `call.end` от сервера: `reportCallEnded()` закрывает системный UI.
- `MicrophoneCallService.start/stop()` для foreground audio.

**`firebase-background-handler.ts`**
- Зарегистрирован как `setBackgroundMessageHandler` для НЕ-звонковых пушей.
- Для `type=call/call_cancelled` — no-op (всё обрабатывается нативно).

### Сервер (API)

**`sendFcmCallPush(fcmToken, data)`** в `pushService.ts`
- Отправляет data-only FCM с `priority: high` и `ttl: 30s`.
- `android.priority: "HIGH"` — обязательно для пробуждения убитого приложения.

**Логика приоритетов** в `signaling.ts`
1. Есть `fcm_token` → FCM data-only (основной путь).
2. Нет `fcm_token` → только WS (только если app онлайн).

---

## Конфигурация VPS

### Переменная окружения `FIREBASE_SERVICE_ACCOUNT_JSON`

Необходима для прямых FCM пушей.

**Как получить:**
1. [Firebase Console](https://console.firebase.google.com) → шестерёнка → Project Settings
2. Service accounts → **Generate new private key** → скачать `.json`
3. Добавить на VPS (содержимое `.json` в одну строку):

```bash
nano ~/docker_containers/messenger/deploy/.env
# Добавить строку:
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

4. Перезапустить API:
```bash
cd ~/docker_containers/messenger/deploy
docker compose up -d --build api
docker logs -f --tail=50 messenger-api  # должно появиться "Firebase Admin SDK initialized"
```

---

## Требования от пользователя (одноразово)

1. **Добавить `FIREBASE_SERVICE_ACCOUNT_JSON` на VPS** (см. выше).
2. **Собрать и установить новый APK** — нативные модули требуют пересборки.
3. **При первом запуске** — выдать разрешение **«Совершение и управление телефонными звонками»**.

---

## Как собрать APK с VoIP-поддержкой

```text
GitHub → Actions → Build Android APK → Run workflow
```

`app.config.js` и `app.json` уже содержат все нужные плагины и разрешения.

---

## Что НЕ нужно делать вручную

- `version.json` генерируется автоматически из `app.json`.
- Firebase Admin SDK уже добавлен в `artifacts/api-server`.
- Плагины в `app.json` уже настроены.
- Все TypeScript изменения применены и проверены.

---

# English Version

# VoIP Call Notifications

**[Русская версия](#voip-уведомления-для-звонков)**

Document describes architecture of system incoming call notifications — "like Telegram".

---

## Table of Contents

- [How It Works](#how-it-works)
  - [Two Delivery Paths for Incoming Call](#two-delivery-paths-for-incoming-call)
  - [App States](#app-states)
- [Components](#components)
  - [Client (Android App)](#client-android-app)
    - [Native Layer (Java, generated by `expo prebuild` plugins)](#native-layer-java-generated-by-expo-prebuild-plugins)
    - [Why Not Headless JS for Calls](#why-not-headless-js-for-calls)
    - [File-based Call Info Persistence](#file-based-call-info-persistence)
    - [JS/TS Layer](#jsts-layer)
  - [Server (API)](#server-api)
- [VPS Configuration](#vps-configuration)
  - [Environment Variable `FIREBASE_SERVICE_ACCOUNT_JSON`](#environment-variable-firebase_service_account_json)
- [User Requirements (one-time)](#user-requirements-one-time)
- [How to Build APK with VoIP Support](#how-to-build-apk-with-voip-support)
- [What NOT to Do Manually](#what-not-to-do-manually)

## How It Works

### Two Delivery Paths for Incoming Call

```
Server
  │
  ├─ WebSocket (app active/background)
  │    └── call.incoming { callId, callerId }
  │         └── CallContext.tsx → shows internal call UI
  │              └── react-native-callkeep → Android ConnectionService
  │                   └── System call screen
  │
  └─ FCM data-only push (priority: high) → wakes killed app
       └── CallFirebaseMessagingService.onMessageReceived() [native Java]
            ├── Registers PhoneAccount in TelecomManager
            ├── Writes callkeep_pending.json to getFilesDir()
            ├── Registers pre-answer BroadcastReceiver (synchronously)
            ├── TelecomManager.addNewIncomingCall() → system call screen
            └── startForegroundService(CallAnswerListenerService)
```

### App States

| State | What Caller Receives | Result |
|---|---|---|
| Active | WS | System screen via CallKeep |
| Background | FCM data push → onMessageReceived | System call screen |
| Killed | FCM data push → onMessageReceived | Full-screen call on lock screen |
| Screen locked | FCM data push → onMessageReceived | Full-screen call on lock screen |

---

## Components

### Client (Android App)

#### Native Layer (Java, generated by `expo prebuild` plugins)

**`CallFirebaseMessagingService.java`** (`plugins/withFirebaseCallService.js`)

Single `FirebaseMessagingService` registered for `com.google.firebase.MESSAGING_EVENT`. On FCM push receipt:

- `type=call`:
  1. Builds `PhoneAccountHandle` from `ApplicationContext` (no Activity needed).
  2. Registers `PhoneAccount` with `CAPABILITY_CALL_PROVIDER` via `TelecomManager`.
  3. Calls `VoiceConnectionService.setPhoneAccountHandle()` for JS layer.
  4. Writes `callkeep_pending.json` to `getFilesDir()` with callId/callerId/callerName/arrivedAt.
  5. Synchronously registers `preAnswerReceiver` in `LocalBroadcastManager` **before** `addNewIncomingCall()` — guarantees answer interception without race.
  6. `TelecomManager.addNewIncomingCall()` → system call screen.
  7. `startForegroundService(CallAnswerListenerService)` — keeps process alive.

- `type=call_cancelled`:
  1. `VoiceConnectionService.getConnection(callId).setDisconnected(MISSED).destroy()` — closes system screen.
  2. Deletes `callkeep_pending.json`.

- All other types: forwards to `ReactNativeFirebaseMessagingHeadlessService` for JS `setBackgroundMessageHandler`.

**`CallAnswerListenerService.java`** (`plugins/withFirebaseCallService.js`)

Foreground service (`foregroundServiceType="shortService"`), starts right after `addNewIncomingCall()`. Registers backup `LocalBroadcastManager` receiver for `ACTION_ANSWER_CALL`/`ACTION_END_CALL`:
- Answer: duplicates file answered=true mark + launches MainActivity. (Main pre-answer receiver in service usually already handled this.)
- Reject before answer: stops itself (`stopSelf()`).
- Auto-stop after 65s (call TTL + buffer) to prevent service leak.

#### Why Not Headless JS for Calls

`react-native-callkeep` requires `RNCallKeepModule.registerPhoneAccount()`, which accesses `reactContext.getCurrentActivity()`. In headless process (killed app) Activity is null — CallKeep doesn't initialize and `displayIncomingCall()` is no-op.

Native `TelecomManager.addNewIncomingCall()` doesn't require Activity — works from any `Context`, including `Service`.

#### File-based Call Info Persistence

Instead of AsyncStorage uses file `callkeep_pending.json` in `getFilesDir()`:
- Written by native Java code before showing system screen.
- Read by JS (`expo-file-system`, `FileSystem.documentDirectory`) on `CallContext` mount.
- Field `answered: true` set after user answers (pre-answer receiver or CallAnswerListenerService).
- `CallContext.tsx` on mount:
  - `answered === true` → calls `acceptCall()` directly (doesn't wait for CallKeep event).
  - `answered === false/absent` → sets `incomingCall` and waits for `onAnswerCall`.

**`MicrophoneForegroundService.java`** (`plugins/withMicrophoneCallService.js`)

Foreground service with `foregroundServiceType="microphone"` (Android 11+). Prevents OS from disabling microphone when minimized/locked during call.
- JS: `NativeModules.MicrophoneCallService.start(callerName)` / `.stop()`.
- Starts in `acceptCall()` and `makeCall()`, stops in `cleanupCall()`.

**`withCallKeep.js`**

Registers `VoiceConnectionService` as `android.telecom.ConnectionService` — required Android Telecom API component.
- Intentionally doesn't use `foregroundServiceType` in CallKeep config (prevents NPE in killed-app path where `RNCallKeepModule.instance` == null).

#### JS/TS Layer

**`services/callkeepService.ts`**
- Wrapper over `react-native-callkeep`.
- Buffers events until `CallContext` mounts.
- `setupCallKeep()` called in `app/_layout.tsx`.

**`context/CallContext.tsx`**
- Reads `callkeep_pending.json` on mount.
- On WS `call.incoming`: shows internal UI.
- On `onAnswerCall` (or `answered=true` in file): `acceptCall()` → WebRTC + WS `call.accept`.
- On `call.end` from server: `reportCallEnded()` closes system UI.
- `MicrophoneCallService.start/stop()` for foreground audio.

**`firebase-background-handler.ts`**
- Registered as `setBackgroundMessageHandler` for NON-call pushes.
- For `type=call/call_cancelled` — no-op (all handled natively).

### Server (API)

**`sendFcmCallPush(fcmToken, data)`** in `pushService.ts`
- Sends data-only FCM with `priority: high` and `ttl: 30s`.
- `android.priority: "HIGH"` — mandatory to wake killed app.

**Priority Logic** in `signaling.ts`
1. Has `fcm_token` → FCM data-only (primary path).
2. No `fcm_token` → WS only (only if app online).

---

## VPS Configuration

### Environment Variable `FIREBASE_SERVICE_ACCOUNT_JSON`

Required for direct FCM pushes.

**How to obtain:**
1. [Firebase Console](https://console.firebase.google.com) → gear → Project Settings
2. Service accounts → **Generate new private key** → download `.json`
3. Add to VPS (JSON contents as single line):

```bash
nano ~/docker_containers/messenger/deploy/.env
# Add line:
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

4. Restart API:
```bash
cd ~/docker_containers/messenger/deploy
docker compose up -d --build api
docker logs -f --tail=50 messenger-api  # should show "Firebase Admin SDK initialized"
```

---

## User Requirements (one-time)

1. **Add `FIREBASE_SERVICE_ACCOUNT_JSON` to VPS** (see above).
2. **Build and install new APK** — native modules require rebuild.
3. **On first launch** — grant **"Make and manage phone calls"** permission.

---

## How to Build APK with VoIP Support

```text
GitHub → Actions → Build Android APK → Run workflow
```

`app.config.js` and `app.json` already contain all needed plugins and permissions.

---

## What NOT to Do Manually

- `version.json` generated automatically from `app.json`.
- Firebase Admin SDK already added to `artifacts/api-server`.
- Plugins in `app.json` already configured.
- All TypeScript changes applied and verified.
