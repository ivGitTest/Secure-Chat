# Семейный мессенджер

Закрытый самоходный мессенджер для семьи или небольшого круга людей.
Работает на собственном VPS, данные не уходят в чужие облака.

---

## Возможности

- **Текстовые чаты** — личные переписки между участниками, история хранится на своём сервере.
- **Голосовые звонки** — WebRTC-звонки через встроенный STUN/TURN-сервер (coturn). Работают за NAT.
- **Уведомления о входящем звонке** — FCM-пуш будит приложение даже когда оно полностью закрыто; открывается системный экран звонка Android.
- **Вход по PIN** — 6-значный PIN вместо пароля, хранится как argon2id-хеш.
- **Авто-обновление клиента** — приложение само проверяет новый APK и предлагает обновиться.
- **Управление пользователями** — создание, блокировка и разблокировка через CLI-скрипт.

---

## Технологии

### Сервер (`artifacts/api-server`)

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| Node.js | 24 | Среда выполнения |
| TypeScript | 5.9 | Типизация |
| Express | 5 | REST API |
| `ws` | 8 | WebSocket — чат и WebRTC-сигналинг |
| Drizzle ORM | — | Схема и запросы к PostgreSQL |
| argon2 | — | Хеширование PIN |
| jsonwebtoken | 9 | JWT-сессии |
| pino | 9 | Структурированный JSON-лог |
| esbuild | 0.27 | Сборка в один бандл для Docker-образа |
| firebase-admin | 13 | Прямые FCM-пуши для VoIP-звонков |
| helmet | 8 | HTTP-заголовки безопасности |
| express-rate-limit | 7 | Rate limiting |

### Клиент (`artifacts/messenger-android`)

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| Expo SDK | 54 | Сборка React Native |
| React Native | 0.81 | UI-фреймворк (Android) |
| react-native-webrtc | 124 | WebRTC (аудио-звонки) |
| react-native-callkeep | 4 | Системный экран звонка (TelecomManager) |
| @react-native-firebase/messaging | 21 | FCM-токен и приём пуш-сообщений |
| expo-notifications | 0.32 | Каналы уведомлений |
| expo-secure-store | 15 | Хранение JWT-токена |
| expo-router | 6 | Навигация |
| react-native-reanimated | 3 | Анимации |
| react-native-keyboard-controller | 1.18 | Поведение клавиатуры в чате |

### Инфраструктура (`deploy/`)

| Сервис | Образ | Назначение |
|--------|-------|------------|
| PostgreSQL | `postgres:16-alpine` | База данных |
| API | Dockerfile на Node.js | REST + WebSocket + сигналинг |
| nginx | `nginx:alpine` | Reverse proxy внутри Docker |
| coturn | `coturn/coturn:latest` | STUN/TURN для WebRTC |

Хостовый reverse proxy (nginx или Caddy) завершает TLS и проксирует трафик на `127.0.0.1:7080`.

---

## Внешние сервисы

| Сервис | Зачем нужен |
|--------|-------------|
| **Firebase / FCM** | Пуш-уведомления о входящих звонках на убитое приложение. Требует Google-аккаунт, Firebase-проект и `google-services.json`. Сервер использует Service Account JSON для отправки прямых FCM data-push. |
| **GitHub Actions** | CI-сборка подписанного APK (`.github/workflows/build-android.yml`). Запускается вручную или по тегу. Артефакт (APK) публикуется в GitHub Releases и подтягивается клиентом при авто-обновлении. |
| **Let's Encrypt / Certbot** | TLS-сертификат для домена. Получается один раз и обновляется через `certbot renew`. |
| **Expo / EAS** | Облачная сборка подписанного APK через EAS Cloud из Replit Shell. Java и Android SDK в Replit для этого не нужны. |

---

## Структура репозитория

```
artifacts/
  api-server/          # Express-сервер: REST + WebSocket + WebRTC-сигналинг
  messenger-android/   # Expo React Native Android-клиент
    plugins/           # Expo config plugins: CallKeep, Firebase, TelecomManager
    app/               # Экраны (Expo Router)
    context/           # CallContext, AuthContext
    services/          # WS, уведомления, звонки
lib/
  db/                  # Drizzle-схема и подключение к PostgreSQL
  api-zod/             # Shared Zod-схемы
scripts/               # Вспомогательные скрипты (gen-keystore, create-users)
deploy/
  docker-compose.yml   # Основной compose-файл
  api/Dockerfile       # Образ API-сервера
  nginx/               # Конфиги nginx
  coturn/              # Конфиг TURN-сервера
  admin-cli.sh         # Интерактивный CLI для управления пользователями
  .env.example         # Шаблон переменных окружения
  README.md            # Подробный гайд по деплою
docs/
  api.md               # HTTP и WebSocket API
  architecture.md      # Архитектурные решения
  containers.md        # Docker-сервисы и сетевая топология
  database.md          # Схема базы данных
  push-notifications.md       # Expo Push — уведомления о сообщениях
  voip-call-notifications.md  # FCM VoIP — уведомления о звонках
  in-app-updates.md    # Механизм авто-обновления APK
.github/
  workflows/
    build-android.yml  # CI: сборка и подпись APK
```

---

## Деплой на VPS

Полный гайд: [`deploy/README.md`](deploy/README.md).

### Требования

- Ubuntu 22.04 / 24.04
- Docker Engine 24+, Docker Compose Plugin v2.20+
- Домен с A-записью на IP сервера
- Открытые порты: `80`, `443`, `3478/udp`, `49152–65535/udp`

### 1. Установить Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

### 2. Клонировать репозиторий

```bash
git clone <REPO_URL> /opt/messenger
cd /opt/messenger
```

### 3. Создать `.env`

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env
```

| Переменная | Описание |
|------------|----------|
| `DOMAIN` | Домен сервера, например `chat.example.com` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL (≥ 32 символа) |
| `JWT_SECRET` | Секрет для подписи JWT (≥ 32 символа) |
| `JWT_EXPIRES_IN` | Срок жизни токена, например `7d` |
| `TURN_SECRET` | Секрет TURN (≥ 32 символа) |
| `TURN_REALM` | Обычно то же, что `DOMAIN` |
| `EXTERNAL_IP` | Публичный IP сервера: `curl -s https://ifconfig.me` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON сервисного аккаунта Firebase (однострочный) — для VoIP-пушей |

Генерация случайных секретов:
```bash
openssl rand -hex 32
```

### 4. Настроить хостовый reverse proxy

Внутри Docker nginx слушает `127.0.0.1:7080`. Хостовый nginx (или Caddy) завершает TLS и проксирует трафик.

**nginx** (`/etc/nginx/sites-available/chat.example.com`):

```nginx
server {
    listen 443 ssl;
    server_name chat.example.com;

    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;

    location /ws {
        proxy_pass         http://127.0.0.1:7080/ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass         http://127.0.0.1:7080;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name chat.example.com;
    return 301 https://$host$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/chat.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

TLS-сертификат (если ещё нет):
```bash
sudo apt install certbot
sudo certbot certonly --manual --preferred-challenges dns -d chat.example.com
```

### 5. Запустить стек

```bash
cd /opt/messenger/deploy
docker compose up -d --build
```

Проверить статус:
```bash
docker compose ps
docker compose logs -f api
```

Проверка работоспособности:
```bash
curl https://chat.example.com/api/v1/health
# {"status":"ok"}
```

### Обновление сервера

```bash
cd /opt/messenger
git pull
cd deploy
docker compose build api
docker compose up -d api
```

---

## Управление пользователями

Интерактивный CLI-скрипт:

```bash
cd /opt/messenger
./deploy/admin-cli.sh
```

Скрипт показывает меню: создать пользователя, сменить PIN, заблокировать/разблокировать, показать список.

Или напрямую:

```bash
docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs create-user --id vasya --name Василий --pin 123456

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs list-users

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs block-user --id vasya
```

---

## Сборка Android APK

### Через EAS Cloud из Replit Shell

Этот способ выполняет сборку на серверах Expo. Локальные Java, Gradle и
Android SDK не требуются.

Перейдите в каталог мобильного приложения и один раз войдите в Expo под
аккаунтом, к которому привязан EAS-проект:

```bash
cd artifacts/messenger-android
npx eas-cli@latest login
npx eas-cli@latest whoami
```

Запуск сборки:

```bash
npx eas-cli@latest build --platform android --profile production
```

Или коротким скриптом:

```bash
bash build_apk.sh
```

Профиль `production` настроен на `buildType: apk`, поэтому результатом будет
устанавливаемый APK, а не AAB. После постановки сборки в очередь EAS покажет
ссылку на страницу и готовый файл.

#### Firebase-конфигурация для EAS Cloud

`google-services.json` нужен для Android-сборки, но не должен попадать в Git.
Добавьте его в EAS как переменную окружения проекта `GOOGLE_SERVICES_JSON`
с типом **Secret file**. Из каталога `artifacts/messenger-android` это можно
сделать так:

```bash
npx eas-cli@latest env:set production \
  --name GOOGLE_SERVICES_JSON \
  --type file \
  --value ./google-services.json \
  --visibility secret \
  --non-interactive
```

EAS передаст секретный файл удалённому сборщику, а `app.config.js` скопирует
его во временный `google-services.json` во время подготовки Android-проекта.
Файл не добавляется в Git. Для GitHub Actions по-прежнему используется
одноимённый secret с текстом JSON.

Проверка переменных:

```bash
npx eas-cli@latest env:list --environment production
```

Если `GOOGLE_SERVICES_JSON` уже настроена в EAS, дополнительных действий
перед сборкой не требуется.

### Автоматически — GitHub Actions

При пуше тега или ручном запуске `Build Android APK` GitHub Actions:

1. Запускает `expo prebuild` на Ubuntu-раннере.
2. Собирает подписанный APK через Gradle.
3. Публикует APK как артефакт сборки.

GitHub Actions работает независимо от EAS Cloud: workflow
`.github/workflows/build-android.yml` сам устанавливает Java и Android SDK,
выполняет `expo prebuild` и собирает APK локальным Gradle. Его секреты и
настройки менять не нужно.

**Необходимые GitHub Secrets:**

| Secret | Содержимое |
|--------|------------|
| `ANDROID_KEYSTORE_BASE64` | Keystore-файл в base64 (см. `scripts/gen-keystore.sh`) |
| `ANDROID_KEYSTORE_PASSWORD` | Пароль keystore |
| `ANDROID_KEY_ALIAS` | Псевдоним ключа |
| `ANDROID_KEY_PASSWORD` | Пароль ключа |
| `GOOGLE_SERVICES_JSON` | Содержимое `google-services.json` (без base64) |

Сгенерировать keystore:
```bash
bash scripts/gen-keystore.sh
```

### Вручную — локальная сборка

Требования: JDK 17, Android SDK, Node.js 24, pnpm.

```bash
cd artifacts/messenger-android

# Предварительная сборка нативного проекта
GOOGLE_SERVICES_JSON="$(cat google-services.json)" \
  pnpm exec expo prebuild --platform android --clean

# Собрать debug APK
cd android && ./gradlew assembleDebug

# Установить на подключённый телефон
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Настройка Firebase (для звонков)

Push-уведомления о входящих звонках работают через Firebase Cloud Messaging (FCM).

1. Создать проект в [Firebase Console](https://console.firebase.google.com).
2. Добавить Android-приложение с package name `com.ivaexpi.messengerandroid`.
3. Скачать `google-services.json` → положить в `artifacts/messenger-android/`.
4. В **Project Settings → Service accounts** сгенерировать приватный ключ.
5. Скопировать содержимое JSON-файла в `FIREBASE_SERVICE_ACCOUNT_JSON` в `deploy/.env` (всё на одной строке).
6. Добавить `GOOGLE_SERVICES_JSON` в GitHub Secrets (для CI-сборки APK).

---

## Безопасность

### Аутентификация и токены
- **PIN хранится как argon2id-хеш** — исходный PIN не восстановим.
- **JWT подписываются только алгоритмом HS256** — алгоритм явно указан в `jwt.verify()`, атаки `alg: none` и RS256-подмена невозможны.
- **5 неверных попыток входа** блокируют аккаунт.
- **user_id и user_name хранятся в `expo-secure-store`** (Android Keystore / шифрованное хранилище) — не в AsyncStorage.

### Транспорт и заголовки
- **TLS обязателен** в продакшне — все токены, PIN и сообщения передаются по зашифрованному каналу.
- **Helmet CSP** настроен как `default-src 'none'` — максимально жёсткая политика для API-сервера без HTML.
- **HTTP-адреса сервера** — клиент предупреждает при вводе `http://` вместо `https://`.

### Rate limiting
- **Логин**: 5 попыток в минуту с одного IP.
- **REST API**: 120 запросов в минуту на авторизованного пользователя.
- **WebSocket сообщения**: скользящее окно 30 сообщений/секунду на пользователя; превышение сбрасывает сообщение с кодом `RATE_LIMITED` (без разрыва соединения).

### Прочее
- **Device ID** формируется через `expo-crypto.randomUUID()` (криптографически стойкий).
- **coturn** запущен без флага `verbose` — не логирует IP-адреса участников в продакшне.
- **Сообщения хранятся в открытом виде** в PostgreSQL — сервер видит текст. Шифрование на уровне транспорта (TLS), но не end-to-end.

---

## Документация

| Файл | Содержимое |
|------|------------|
| [`docs/api.md`](docs/api.md) | HTTP и WebSocket API, форматы сообщений, коды ошибок |
| [`docs/architecture.md`](docs/architecture.md) | Архитектурные решения |
| [`docs/containers.md`](docs/containers.md) | Docker-сервисы и сетевая топология |
| [`docs/database.md`](docs/database.md) | Схема базы данных |
| [`docs/push-notifications.md`](docs/push-notifications.md) | Expo Push — уведомления о сообщениях |
| [`docs/voip-call-notifications.md`](docs/voip-call-notifications.md) | FCM VoIP — уведомления о звонках |
| [`docs/in-app-updates.md`](docs/in-app-updates.md) | Механизм авто-обновления APK |
| [`deploy/README.md`](deploy/README.md) | Полный гайд по деплою на VPS |

## Лицензия

Этот проект распространяется под лицензией MIT. Подробности см. в файле [LICENSE](LICENSE).
