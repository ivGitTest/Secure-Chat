# Семейный мессенджер

## Оглавление

- [Возможности](#Возможности)
- [Технологии](#Технологии)
- [Внешние сервисы](#Внешние-сервисы)
- [Структура репозитория](#Структура-репозитория)
- [Деплой на VPS](#Деплой-на-VPS)
- [Управление пользователями](#Управление-пользователями)
- [Сборка Android APK](#Сборка-Android-APK)
- [Настройка Firebase (для звонков)](#Настройка-Firebase-для-звонков)
- [Безопасность](#Безопасность)
- [Документация](#Документация)

---

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
| **GitHub Actions** | Ручная CI-сборка подписанного APK (`.github/workflows/build-android.yml`). APK и `version.json` сохраняются как артефакты workflow. |
| **Let's Encrypt / Certbot** | TLS-сертификат для домена. Получается один раз и обновляется через `certbot renew`. |
| **Expo CLI** | Сборка нативного Android-проекта через `expo prebuild`. CI не использует EAS cloud — только локальный Gradle. |

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

Скрипт показывает меню: создать пользователя, сменить PIN, заблокировать/разблокировать,
показать список и настроить видимость контактов.

Или напрямую:

```bash
docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs create-user --id vasya --name Василий --pin 123456

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs list-users

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs block-user --id vasya
```

### Видимость контактов

По умолчанию каждый пользователь видит всех остальных. Администратор может скрыть
пару пользователей через пункт **«Видимость контактов»** в `./deploy/admin-cli.sh`.
Настройка всегда симметрична: если скрыть A и B, они оба перестанут видеть друг друга;
нельзя настроить одностороннюю видимость.

Доступные действия:

- показать все скрытые пары;
- показать, кого видит выбранный пользователь;
- связать двух пользователей — показать их друг другу;
- разорвать связь — скрыть их друг от друга;
- сбросить ограничения пользователя — он снова видит всех, а его связь с другими
  пользователями удаляется с обеих сторон.

В таблице хранятся только скрытые пары. Отсутствие записи означает, что пользователь
видит всех, включая новых пользователей. После изменения новый список применяется
при следующем открытии экрана контактов.
Уже открытый диалог не является частью этой настройки.

При необходимости те же операции можно вызвать напрямую:

```bash
docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs link-users --a alice --b bob

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs unlink-users --a alice --b bob

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs list-visibility

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs show-contacts --id alice

docker compose -f deploy/docker-compose.yml exec api \
  node /app/dist/admin.mjs reset-visibility --id alice
```

---

## Сборка Android APK

### Рекомендуемый вариант — EAS Cloud

Для запуска сборки APK через EAS используйте скрипт:

```bash
cd artifacts/messenger-android
./build_apk.sh
```

Скрипт показывает текущие значения из `version.json`, затем запрашивает только
два значения:

| Поле | Что указать |
|------|------------|
| `versionName` | Версия приложения, например `2.0.8` |
| `changelog` | Краткое описание изменений, например `Исправлены уведомления` |

`versionCode` вводить не нужно. Скрипт автоматически берёт текущий
`versionCode` из `version.json` и увеличивает его на `1`. Например, после
`11` будет создан `12`.

После ввода данных скрипт:

1. Записывает новый `version.json` с `versionName`, `versionCode`, `releasedAt`,
   `changelog` и `apkUrl`.
2. Запускает сборку APK в EAS Cloud с профилем `preview`.
3. После завершения сборки выводит инструкции для скачивания APK.

Для запуска другого профиля:

```bash
cd artifacts/messenger-android
./scripts/eas-build.sh production
```

Для работы EAS необходим доступ к проекту и авторизация EAS CLI.

### GitHub Actions

В GitHub откройте **Actions → Build Android APK → Run workflow**. Форма
запрашивает два обязательных значения:

| Поле | Что указать |
|------|------------|
| `version_name` | Версия приложения, например `2.0.8` |
| `changelog` | Краткое описание изменений |

GitHub Actions:

1. Запускает `expo prebuild` на Ubuntu-раннере.
2. Увеличивает `versionCode` из текущего `version.json` на `1`.
3. Автоматически добавляет текущие дату и время в `releasedAt`.
4. Собирает подписанный APK через Gradle.
5. Публикует APK и `version.json` как артефакты workflow.
6. После успешной сборки сохраняет обновлённый `version.json` в выбранную
   ветку, поэтому следующая сборка продолжает нумерацию автоматически.

Эта workflow-сборка сама не выкладывает APK на VPS. После её завершения
скачайте APK, загрузите `version.json` на VPS и используйте скрипт деплоя,
описанный в [`deploy/README.md`](deploy/README.md#публикация-apk-через-deploy-updatesh).

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

- **PIN хранится как argon2id-хеш** — исходный PIN не восстановим.
- **JWT подписываются** секретом из `JWT_SECRET`.
- **5 неверных попыток входа** блокируют аккаунт.
- **Rate limiting**: 5 попыток логина в минуту с одного IP; 120 запросов в минуту на авторизованного пользователя.
- **Сообщения хранятся в открытом виде** в PostgreSQL — сервер видит текст. Шифрование на уровне транспорта (TLS), но не end-to-end.
- **TLS обязателен** в продакшне — все токены и PIN передаются по зашифрованному каналу.

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
