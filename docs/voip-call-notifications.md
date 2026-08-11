# VoIP-уведомления для звонков

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
