# Руководство по развёртыванию — Семейный мессенджер

**[English version](#english-version)**

Это руководство описывает развёртывание мессенджера на чистом VPS с Ubuntu с помощью Docker Compose.

---

## Оглавление

- [Предварительные требования](#предварительные-требования)
- [Шаг 1 — Клонирование репозитория](#шаг-1--клонирование-репозитория)
- [Шаг 2 — Настройка переменных окружения](#шаг-2--настройка-переменных-окружения)
- [Шаг 3 — Настройка обратного прокси на хосте](#шаг-3--настройка-обратного-прокси-на-хосте)
- [Шаг 4 — Сборка и запуск стека](#шаг-4--сборка-и-запуск-стека)
- [Шаг 5 — Проверка развёртывания](#шаг-5--проверка-развёртывания)
- [Шаг 6 — Настройка push-уведомлений (необязательно, но рекомендуется)](#шаг-6--настройка-push-уведомлений-необязательно-но-рекомендуется)
- [Шаг 7 — Создание пользователей](#шаг-7--создание-пользователей)
- [Обновление приложения](#обновление-приложения)
- [Настройка телефона для надёжных звонков (Xiaomi / Samsung)](#настройка-телефона-для-надёжных-звонков-xiaomi--samsung)
- [Настройка видимости контактов](#настройка-видимости-контактов)
- [Полезные команды](#полезные-команды)
- [Обзор архитектуры](#обзор-архитектуры)
- [Уведомления об окончании действия сертификата](#уведомления-об-окончании-действия-сертификата)
- [Автоматическое резервное копирование базы данных](#автоматическое-резервное-копирование-базы-данных)
- [Восстановление базы данных](#восстановление-базы-данных)
- [Устранение неполадок](#устранение-неполадок)

## Предварительные требования

| Требование | Версия |
|-------------|---------|
| Ubuntu | 22.04 LTS или 24.04 |
| Docker Engine | 24+ |
| Плагин Docker Compose | v2.20+ |
| Домен с DNS-записью A | Должна указывать на IP вашего VPS |
| Открытые порты | 3478 (UDP) · 49152–65535 (UDP); порты 80/443 обрабатывает прокси хоста |

### Установка Docker (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## Шаг 1 — Клонирование репозитория

```bash
git clone <YOUR_REPO_URL> messenger
cd messenger
```

---

## Шаг 2 — Настройка переменных окружения

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # или любой другой редактор
```

Заполните все значения:

| Переменная | Описание |
|----------|-------------|
| `DOMAIN` | Ваш публичный домен, например `chat.example.com` |
| `POSTGRES_PASSWORD` | Надёжный случайный пароль (не менее 32 символов) |
| `JWT_SECRET` | Случайный секрет для подписи JWT (не менее 32 символов) |
| `JWT_EXPIRES_IN` | Срок действия токена, например `7d` |
| `TURN_SECRET` | Случайный секрет для учётных данных TURN (не менее 32 символов) |
| `TURN_REALM` | Обычно совпадает с `DOMAIN` |
| `EXTERNAL_IP` | Публичный IP вашего VPS — выполните `curl -s https://ifconfig.me` |

Сгенерируйте случайные секреты:
```bash
openssl rand -hex 32
```

---

## Шаг 3 — Настройка обратного прокси на хосте

Nginx мессенджера работает внутри Docker на `127.0.0.1:7080` (только HTTP).
Обратный прокси на хосте обслуживает TLS для `chat.example.com` и перенаправляет сюда трафик.

### Если прокси на хосте — nginx (системный сервис)

Создайте файл нового сайта, например `/etc/nginx/sites-available/chat.example.com`:

```nginx
server {
    listen 443 ssl;
    server_name chat.example.com;

    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # WebSocket — must appear before /api/
    location /ws {
        proxy_pass         http://127.0.0.1:7080/ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass         http://127.0.0.1:7080;
        proxy_http_version 1.1;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name chat.example.com;
    return 301 https://$host$request_uri;
}
```

Затем включите сайт и перезагрузите nginx:

```bash
sudo ln -s /etc/nginx/sites-available/chat.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### Если прокси на хосте — Caddy

Добавьте конфигурацию в `Caddyfile`:

```
chat.example.com {
    reverse_proxy /ws 127.0.0.1:7080 {
        transport http {
            versions 1.1
        }
        header_up Upgrade {http.upgrade}
        header_up Connection "upgrade"
    }
    reverse_proxy 127.0.0.1:7080
}
```

Затем перезагрузите Caddy: `sudo systemctl reload caddy`

### TLS-сертификат для прокси на хосте

Если у прокси ещё нет сертификата для `chat.example.com`, получите его через DNS-проверку (открывать порты не требуется):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --manual --preferred-challenges dns -d chat.example.com
```

Следуйте инструкциям: добавьте TXT-запись, дождитесь её проверки и нажмите Enter.

---

## Шаг 4 — Сборка и запуск стека

```bash
cd deploy
docker compose up -d --build
```

Первая сборка занимает несколько минут: скачивается Node.js, устанавливается pnpm и запускается esbuild.

### Проверка состояния сервисов

```bash
docker compose ps
docker compose logs -f api
```

Все четыре сервиса должны иметь статус `healthy` или `running`:

```
NAME       STATUS
postgres   healthy
api        healthy
coturn     running
nginx      healthy
```

---

## Шаг 5 — Проверка развёртывания

### Проверка состояния сервера

```bash
curl https://chat.example.com/api/v1/health
# Ожидаемый результат: {"status":"ok"}
```

### Установка WebSocket-соединения

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Version: 13" \
  https://chat.example.com/ws
# Ожидаемый результат: HTTP/1.1 101 Switching Protocols
```

---

## Шаг 6 — Настройка push-уведомлений (необязательно, но рекомендуется)

Push-уведомления позволяют членам семьи получать сообщения о новых сообщениях и звонках, даже когда приложение работает в фоне или телефон заблокирован.

### Обзор

Приложение использует **Expo Push Service → Google FCM** для Android-уведомлений. Серверу не нужны учётные данные Firebase: он вызывает Expo Push API (`exp.host/--/api/v2/push/send`), а тот передаёт уведомления в FCM.

### 6a — Создание проекта Firebase

1. Откройте [console.firebase.google.com](https://console.firebase.google.com) и войдите с помощью любого Google-аккаунта.
2. Нажмите **Add project**, задайте имя (например, `family-messenger`), отключите Google Analytics (он не нужен) и нажмите **Create project**.
3. В обзоре проекта нажмите значок **Android** (➕ Add app).
4. Укажите **имя пакета Android**: `com.ivaexpi.messengerandroid`
5. Псевдоним: `Семейный мессенджер` (необязательно).
6. Нажмите **Register app**, затем **Download `google-services.json`**.
7. Остальную часть мастера можно пропустить: настройкой SDK занимается `expo-notifications`.

### 6b — Добавление google-services.json в секреты GitHub Actions

Файл `google-services.json` автоматически создаётся во время CI-сборки. Сохраните **всё его содержимое** в секрете GitHub:

```bash
# Вывести содержимое файла
cat google-services.json
```

В репозитории GitHub откройте **Settings → Secrets and variables → Actions → New repository secret**:

| Имя секрета | Значение |
|-------------|-------|
| `GOOGLE_SERVICES_JSON` | Полное содержимое `google-services.json` |

В workflow сборки уже есть шаг, который записывает этот файл перед сборкой.

### 6c — Добавление google-services.json в секреты EAS (одноразово)

Для облачной сборки через EAS файл, который находится локально и добавлен в `.gitignore`, в репозиторий не попадает. Один раз загрузите его содержимое в секрет проекта EAS:

```bash
cd artifacts/messenger-android
pnpm dlx eas-cli@latest secret:create \
  --scope project \
  --name GOOGLE_SERVICES_JSON \
  --type string \
  --value "$(cat google-services.json)"
```

После этого повторно выполнять команду не нужно. `app.config.js` получит секрет во время сборки и создаст `google-services.json` перед `prebuild`.

### 6d — Подключение Firebase к проекту Expo (одноразово)

Сервис push-уведомлений Expo должен знать учётные данные проекта Firebase, чтобы пересылать уведомления. Выполните это один раз на своём компьютере:

```bash
cd artifacts/messenger-android
pnpm dlx eas-cli@latest credentials
# Выберите: Android → Manage FCM credentials → Upload FCM API key
```

Получите **Server key** в Firebase Console → Project Settings → Cloud Messaging → **Cloud Messaging API (Legacy)** либо используйте **Service Account** (API v1). Следуйте подсказкам EAS.

### Примечания

- Уведомления работают только в **standalone APK-сборках** (в том числе из GitHub Actions). В Expo Go в консоли появляется `[Push] Registration skipped` — это ожидаемо.
- `google-services.json` **не содержит секретов**. Его можно безопасно добавить в репозиторий, если вы не хотите использовать секрет GitHub. Для этого добавьте исключение `!artifacts/messenger-android/google-services.json` в `.gitignore`.
- Если полностью пропустить этот шаг, приложение будет работать обычно, но push-уведомления не будут доставляться в автономном режиме.

### 6e — Архитектура FCM-пушей для входящих звонков

Для звонков используется **прямой FCM** через Firebase Admin SDK (не Expo Push Service).
Это позволяет точно контролировать payload и приоритет сообщения.

#### Когда сервер отправляет FCM-пуш

| Состояние получателя | Действие сервера |
|---|---|
| Онлайн (активный WebSocket) | Доставка через WS (`call.incoming`), пуш **не отправляется** |
| Офлайн / приложение убито | Отправляется FCM data-push с `priority=high` |

Такое разделение гарантирует ровно один системный экран входящего звонка: WS и FCM никогда не запускают `TelecomManager.addNewIncomingCall()` одновременно.

#### Структура FCM-сообщения для звонка

```json
{
  "token": "<FCM device token>",
  "data": {
    "type": "call",
    "callId": "<uuid>",
    "callerId": "<userId>",
    "callerName": "<display name>"
  },
  "android": {
    "priority": "high",
    "ttl": 30000
  }
}
```

**Почему сообщение data-only (без `notification`-блока):**
Android Firebase различает два типа FCM-сообщений:

- **Data-only** (только `data`, без `notification`): всегда вызывает
  `FirebaseMessagingService.onMessageReceived()` — даже когда приложение убито.
  Именно это нужно для входящего звонка: `CallFirebaseMessagingService` получает
  сообщение и вызывает `TelecomManager.addNewIncomingCall()`.

- **Notification message** (есть `notification`-блок): когда приложение в фоне
  или убито, Android обрабатывает уведомление самостоятельно в системном трее и
  **не вызывает** `onMessageReceived()`. `CallFirebaseMessagingService` не получит
  управление, и системный экран звонка не откроется.

**`android.priority: "high"`** освобождает пуш от стандартного режима Doze:
Android разбудит устройство и доставит сообщение в `onMessageReceived()` даже
при заблокированном экране — если приложение было **завершено обычным образом**
(системой или свайпом пользователя).

> **Ограничение: принудительная остановка (force-stop)**
> FCM high-priority data messages **не гарантируют** доставку в
> `onMessageReceived()`, если пользователь остановил приложение через
> «Настройки → Приложения → Принудительная остановка». В этом состоянии Android
> блокирует любые входящие сообщения до следующего явного запуска приложения.
> Эта ситуация считается неподдерживаемым краевым случаем — инструкция к
> приложению должна предупреждать пользователей не использовать принудительную
> остановку.

> **Примечание по OEM-устройствам (Xiaomi, Huawei, OPPO):** Менеджеры батареи
> этих производителей могут дополнительно ограничивать фоновые процессы сверх
> стандартного Android. Если звонок не приходит с убитым приложением, добавьте
> приложение в исключения оптимизации батареи в настройках устройства.

---

## Шаг 7 — Создание пользователей

Запустите административную CLI внутри контейнера `api`. Команды принимают флаги и не используют интерактивные запросы.

```bash
# Создать пользователя (PIN должен состоять ровно из 6 цифр)
docker compose exec api node /app/dist/admin.mjs create-user \
  --id alice --name "Alice" --pin 123456

# Показать всех пользователей
docker compose exec api node /app/dist/admin.mjs list-users

# Заблокировать / разблокировать пользователя
docker compose exec api node /app/dist/admin.mjs block-user   --id alice
docker compose exec api node /app/dist/admin.mjs unblock-user --id alice
```

Доступные команды:

| Команда | Обязательные флаги |
|---------|---------------|
| `create-user` | `--id <userId>` `--name <name>` `--pin <6-digit-pin>` |
| `list-users` | — |
| `block-user` | `--id <userId>` |
| `unblock-user` | `--id <userId>` |
| `change-pin` | `--id <userId>` `--pin <6-digit-pin>` |
| `link-users` | `--a <userId>` `--b <userId>` |
| `unlink-users` | `--a <userId>` `--b <userId>` |
| `list-visibility` | — |
| `show-contacts` | `--id <userId>` |
| `reset-visibility` | `--id <userId>` |

---

## Настройка телефона для надёжных звонков (Xiaomi / Samsung)

Чтобы звонок не обрывался при погашенном экране и входящий вызов показывался
на заблокированном телефоне, на каждом устройстве нужно один раз выполнить
настройку. Производители (особенно Xiaomi) агрессивно ограничивают фоновую
работу приложений — без этих разрешений система может «замораживать»
мессенджер.

### Общее для всех Android (один раз после установки)

1. **Аккаунт для звонков (Calling account)**: Настройки → Приложения → Телефон
   (или Настройки → Звонки) → «Аккаунты для звонков» / «Calling accounts» →
   включите «Семейный мессенджер». Без этого системный экран входящего звонка
   не появится на заблокированном телефоне.
2. При первом запуске приложения выдайте все запрошенные разрешения:
   микрофон, уведомления, телефон.

### Xiaomi (MIUI / HyperOS)

Настройки → Приложения → Все приложения → «Семейный мессенджер»:

1. **Автозапуск** — включить.
2. **Контроль активности (батарея)** — «Нет ограничений».
3. **Другие разрешения** → включить:
   - «Показывать на экране блокировки»;
   - «Показывать всплывающие окна»;
   - «Показывать всплывающие окна в фоновом режиме».
4. В недавних приложениях (меню «квадрат») потяните карточку мессенджера вниз
   и нажмите «замок» — это защитит приложение от выгрузки при очистке памяти.

### Samsung (One UI)

Настройки → Приложения → «Семейный мессенджер»:

1. **Батарея** → «Без ограничений» (снять оптимизацию).
2. Настройки → Батарея → «Ограничения в фоновом режиме» → убедитесь, что
   мессенджер **не** находится в списках «Приложения в глубоком сне» и
   «Приложения в состоянии сна». При необходимости добавьте его в «Приложения
   без ограничений».
3. Уведомления мессенджера — разрешить, включая всплывающие.

### Проверка

1. Позвоните на настроенный телефон с заблокированным экраном — должен
   появиться системный экран звонка; ответ с него сразу соединяет разговор
   (приложение открывать не нужно).
2. Примите звонок, погасите экран и подождите 3–5 минут — звонок не должен
   оборваться.
3. Завершите звонок с одной стороны — у второй стороны экран звонка должен
   закрыться в течение нескольких секунд.

### Обновление после релиза «надёжные звонки»

Изменения затрагивают и сервер, и приложение — нужно обновить оба:

1. **Сервер** (на VPS):

   ```bash
   cd /opt/messenger/deploy
   git pull
   docker compose up -d --build api
   curl https://chat.example.com/api/v1/health
   ```

2. **Приложение**: соберите новый APK (EAS или GitHub Actions), выложите его
   через `./deploy-update.sh "https://ссылка-на-apk"` (см.
   [Обновление приложения](#обновление-приложения)) и установите обновление на
   всех телефонах.

3. После установки проверьте пункты из раздела «Проверка» выше.

Порядок важен: сначала сервер, затем клиенты. Старый клиент со старым
сервером продолжит работать, но исправления звонков заработают полностью
только когда обновлены обе стороны.

## Настройка видимости контактов

По умолчанию все пользователи видят всех остальных. Чтобы ограничить список,
запустите интерактивный CLI:

```bash
cd /opt/messenger
./deploy/admin-cli.sh
# выберите пункт 6 «Видимость контактов»
```

Все настройки симметричны. Операция «связать A и B» делает их видимыми в обоих
направлениях, а операция «разорвать связь» скрывает их в обоих направлениях.
Одностороннюю настройку сделать нельзя. В базе хранятся только скрытые пары;
если пары нет, пользователи видят друг друга.

В подменю доступны:

1. Показать все реальные взаимно видимые пары пользователей. Список сгруппирован
   по пользователю и разделён линиями. Так как видимость симметрична, каждая пара
   отображается с обеих сторон:

   ```text
   Текущие видимые пары:
   Visible pairs (users who see each other):
   ------------------------------
     alice (Alice) ↔ bob (Bob)
     alice (Alice) ↔ ivan (Ivan)
     alice (Alice) ↔ test (Test)
   ------------------------------
     bob (Bob) ↔ alice (Alice)
     bob (Bob) ↔ ivan (Ivan)
     bob (Bob) ↔ test (Test)
   ------------------------------
     ivan (Ivan) ↔ alice (Alice)
     ivan (Ivan) ↔ bob (Bob)
   ```

2. Показать контакты выбранного пользователя.
3. Связать двух пользователей (показать друг другу).
4. Разорвать связь двух пользователей (скрыть друг от друга).
5. Сбросить ограничения пользователя. После этого он снова видит всех.

Для автоматизации доступны те же команды напрямую:

```bash
docker compose exec api node /app/dist/admin.mjs link-users --a alice --b bob
docker compose exec api node /app/dist/admin.mjs unlink-users --a alice --b bob
docker compose exec api node /app/dist/admin.mjs list-visibility
docker compose exec api node /app/dist/admin.mjs show-contacts --id alice
docker compose exec api node /app/dist/admin.mjs reset-visibility --id alice
```

Изменение применяется при следующем открытии экрана контактов в приложении.
Перезапуск приложения не требуется.

---

## Обновление приложения

### Универсальная инструкция после изменений

В большинстве обновлений меняется только серверный код (`api`). В этом случае
останавливать весь стек и PostgreSQL не нужно:

```bash
cd /opt/messenger/deploy
git pull
docker compose up -d --build api
docker compose ps
curl https://chat.example.com/api/v1/health
```

Команда пересобирает и перезапускает только `api`. Данные PostgreSQL не
затрагиваются, а `nginx` и `coturn` продолжают работать без перерыва.

#### Какой контейнер обновлять

| Что изменилось | Команда |
|---|---|
| `artifacts/api-server`, API, WebSocket, миграции | `docker compose up -d --build api` |
| `deploy/nginx.conf` или файлы, которые nginx раздаёт | `docker compose up -d --force-recreate nginx` |
| `deploy/coturn.conf` или настройки TURN | `docker compose up -d --force-recreate coturn` |
| `deploy/docker-compose.yml`, Dockerfile или общие переменные окружения | `docker compose up -d --build` |
| Несколько сервисов или сомневаетесь, что именно изменилось | `docker compose up -d --build` |

После обновления nginx можно проверить локальный healthcheck:

```bash
curl http://127.0.0.1:7080/healthz
```

После обновления `coturn` проверьте:

```bash
docker compose logs --tail=50 coturn
docker compose ps coturn
```

#### Полный перезапуск

`docker compose down` нужен только если требуется полностью остановить стек,
изменились сети/монтирования или обычный `up -d --build` не применяет конфигурацию.
Без удаления томов безопасный полный сценарий такой:

```bash
cd /opt/messenger/deploy
git pull
docker compose down
docker compose up -d --build
docker compose ps
curl https://chat.example.com/api/v1/health
```

`docker compose down` не удаляет данные PostgreSQL, если не добавлять флаг
`-v`. **Никогда не используйте `docker compose down -v` для обычного обновления**:
эта команда удаляет Docker volumes и может уничтожить данные, если они хранятся
в volume. В текущей конфигурации резервные копии находятся отдельно на хосте,
но это не заменяет проверку базы и бэкапов.

#### Публикация APK и version.json через deploy-update.sh

Для выкладки APK контейнеры перезапускать не нужно. Nginx раздаёт файлы из
`/opt/messenger/updates/`, поэтому достаточно обновить APK в этой папке.

Скрипт `deploy/deploy-update.sh` запускается **непосредственно на VPS**.
При передаче ссылки на GitHub Actions-артефакт он извлекает из ZIP и
устанавливает оба файла: APK и вложенный `version.json`.

```bash
cd /opt/messenger/deploy
./deploy-update.sh "https://github.com/OWNER/REPO/actions/runs/RUN_ID/artifacts/ARTIFACT_ID"
```

Также принимается прямая ссылка на APK из EAS Cloud или любого CDN:

```bash
./deploy-update.sh "https://ссылка-на-apk"
```

В режиме прямой ссылки `version.json` не входит в загрузку и сохраняется
без изменений. Для автоматического обновления метаданных используйте
GitHub Actions-артефакт.

Если запустить скрипт без параметра, он запросит ссылку интерактивно:

```bash
./deploy-update.sh
Укажи URL APK:
```

Поведение скрипта:

1. Проверяет, что ссылка начинается с `http://` или `https://`.
2. Если параметр отсутствует или не является URL, запрашивает ссылку повторно.
3. Для GitHub Actions-артефакта скачивает ZIP через GitHub API, находит APK и
   `version.json` независимо от их вложенного пути.
4. Проверяет формат `version.json` и запрещает откат на меньший `versionCode`.
5. Атомарно заменяет APK в `/opt/messenger/updates/messenger.apk`, а затем
   `version.json` в `/opt/messenger/updates/version.json`.
6. Для прямой ссылки заменяет только APK и оставляет текущий `version.json`.

После этого на VPS запускается `deploy-update.sh`. Для проверки:

```bash
curl https://chat.example.com/updates/version.json
curl -I https://chat.example.com/updates/messenger.apk
```

Перезапуск Docker-контейнеров после публикации APK не требуется.

---

## Полезные команды

```bash
# Смотреть логи в реальном времени
docker compose logs -f

# Остановить все сервисы
docker compose down

# Остановить сервисы и удалить все данные (⚠ необратимо)
docker compose down -v

# Перезапустить отдельный сервис
docker compose restart api
docker compose restart nginx

# Открыть консоль базы данных
docker compose exec postgres psql -U messenger -d messenger
```

---

## Обзор архитектуры

```
Интернет
   │
   ├── :80  ──────────────────────► nginx (перенаправление HTTP → HTTPS)
   ├── :443 ─────────────────────── nginx (завершение TLS)
   │           /ws  ──────────────► api:3000  (WebSocket)
   │           /api/ ─────────────► api:3000  (REST)
   │
   └── :3478/udp ─────────────────► coturn (ретранслятор STUN/TURN)
       :49152-65535/udp ──────────► coturn (ретрансляция медиаданных)

Внутренняя сеть Docker (messenger):
  nginx ──► api ──► postgres
```

---

## Уведомления об окончании действия сертификата

Скрипт `deploy/scripts/check-cert-expiry.sh` проверяет, сколько дней осталось до окончания действия TLS-сертификата, и отправляет уведомление, если осталось менее **14 дней**. Запускайте его ежедневно через cron, чтобы вовремя исправить проблему с продлением и не допустить отключения мессенджера.

### Как это работает

1. Если локальный файл сертификата (`deploy/certs/fullchain.pem`) существует, скрипт читает его; в противном случае подключается к рабочему домену через `openssl s_client`.
2. Вычисляет количество дней до окончания действия сертификата.
3. Если количество дней **ниже порога**, отправляет одно или несколько уведомлений и завершается с кодом 1 (поэтому cron также может отправить письмо пользователю root).
4. Если сертификат действителен, записывает строку OK в лог и завершается с кодом 0.

### Настройка ежедневной задачи cron

```bash
sudo crontab -e
```

Добавьте задачу, изменив путь в соответствии с расположением клонированного репозитория:

```cron
# Проверять срок действия сертификата каждое утро в 08:00
0 8 * * * DOMAIN=chat.example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Настройка канала уведомлений

Задайте переменные в shell, в `/etc/environment` или добавьте их в начало строки cron.

#### Вариант A — Telegram (рекомендуется, SMTP не нужен)

1. Создайте бота: отправьте сообщение [@BotFather](https://t.me/BotFather) → `/newbot` → скопируйте токен.
2. Начните чат с ботом (или добавьте его в группу), затем получите ID чата:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -m json.tool | grep '"id"'
   ```
3. Добавьте переменные в строку crontab:
   ```cron
   0 8 * * * DOMAIN=chat.example.com TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
   ```

#### Вариант B — электронная почта

Требуется `mailutils` (или совместимая команда `mail`) и настроенный MTA на хосте, например Postfix с relay или `msmtp`:

```bash
sudo apt-get install -y mailutils
```

Затем добавьте `ALERT_EMAIL` в строку cron:

```cron
0 8 * * * DOMAIN=chat.example.com ALERT_EMAIL=you@example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

Оба канала могут работать одновременно — задайте все четыре переменные.

### Изменение порога предупреждения

Порог по умолчанию — 14 дней. Переопределите его с помощью `WARN_DAYS`:

```cron
0 8 * * * DOMAIN=chat.example.com WARN_DAYS=21 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Проверка без ожидания

Чтобы принудительно получить предупреждение, временно задайте для `WARN_DAYS` значение больше фактического количества оставшихся дней:

```bash
DOMAIN=chat.example.com WARN_DAYS=999 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
  deploy/scripts/check-cert-expiry.sh
```

---

## Автоматическое резервное копирование базы данных

Скрипт `deploy/scripts/backup-postgres.sh` запускает `pg_dump` внутри работающего контейнера postgres и записывает сжатый дамп в каталог на хосте. Дополнительные инструменты не требуются: используется доступная на хосте команда `docker compose exec`.

### Ротация резервных копий

| Тип | Шаблон имени файла | Хранение |
|------|-----------------|----------|
| Ежедневная | `daily-YYYY-MM-DD.sql.gz` | Последние **7** дампов |
| Еженедельная | `weekly-YYYY-MM-DD.sql.gz` | Последние **4** дампа (создаются по воскресеньям) |

По умолчанию резервные копии записываются в `/opt/messenger/backups` (каталог можно изменить через `BACKUP_DIR`). Он находится в **файловой системе хоста**, за пределами всех Docker volumes, поэтому команды `docker compose down -v` и `docker volume prune` не затронут эти файлы.

### Настройка ежедневной задачи cron

```bash
sudo crontab -e
```

Добавьте задачу, изменив путь в соответствии с расположением клонированного репозитория:

```cron
# Создавать резервную копию Postgres каждую ночь в 02:00
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

### Необязательно: уведомление об ошибке в Telegram

Если Telegram уже используется для уведомлений об окончании действия сертификата, используйте тот же токен бота и ID чата. Добавьте обе переменные в строку cron:

```cron
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy \
          TELEGRAM_BOT_TOKEN=<token> \
          TELEGRAM_CHAT_ID=<chat_id> \
          /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

Сообщение в Telegram отправляется **только при ошибке**; при успешном выполнении уведомление не отправляется, запись появляется только в лог-файле.

### Переменные конфигурации

| Переменная | Значение по умолчанию | Описание |
|----------|---------|-------------|
| `COMPOSE_DIR` | Каталог скрипта | Каталог, содержащий `docker-compose.yml` |
| `BACKUP_DIR` | `/opt/messenger/backups` | Каталог хоста для файлов дампов |
| `KEEP_DAILY` | `7` | Количество сохраняемых ежедневных дампов |
| `KEEP_WEEKLY` | `4` | Количество сохраняемых еженедельных дампов |
| `TELEGRAM_BOT_TOKEN` | *(пусто)* | Токен бота для уведомлений об ошибках |
| `TELEGRAM_CHAT_ID` | *(пусто)* | ID чата или пользователя для уведомлений об ошибках |

### Немедленное создание резервной копии вручную

```bash
COMPOSE_DIR=/path/to/messenger/deploy \
  /path/to/messenger/deploy/scripts/backup-postgres.sh
```

### Проверка создания резервных копий

```bash
ls -lh /opt/messenger/backups/
# Пример вывода:
# -rw-r--r-- 1 root root  42K Jul 28 02:00 daily-2026-07-28.sql.gz
# -rw-r--r-- 1 root root  41K Jul 27 02:00 daily-2026-07-27.sql.gz
# -rw-r--r-- 1 root root  40K Jul 27 02:00 weekly-2026-07-27.sql.gz
```

### Копии за пределами VPS (рекомендуется)

Для защиты от потери VPS периодически синхронизируйте каталог резервных копий с другим местом, например с помощью `rsync`:

```bash
# Запускайте ежедневно или еженедельно с другого компьютера / через cron
rsync -avz user@your-vps:/opt/messenger/backups/ ~/messenger-backups/
```

Также можно использовать любой инструмент облачного хранилища (`rclone`, `s3cmd`, `restic` и т. п.), который умеет читать каталог на хосте.

---

## Восстановление базы данных

Выполните следующие шаги, чтобы восстановить базу данных из файла резервной копии.

### 1 — Выберите файл резервной копии

```bash
ls -lht /opt/messenger/backups/
# Выберите файл для восстановления, например daily-2026-07-28.sql.gz
```

### 2 — Остановите API, чтобы новые записи не поступали

```bash
cd /path/to/messenger/deploy
docker compose stop api
```

### 3 — Удалите и создайте базу заново

```bash
# Откройте консоль psql внутри контейнера postgres
docker compose exec postgres psql -U messenger -d postgres

-- Внутри psql:
DROP DATABASE messenger;
CREATE DATABASE messenger OWNER messenger;
\q
```

### 4 — Восстановите дамп

```bash
# Распакуйте дамп и передайте его напрямую в psql внутри контейнера
gunzip -c /opt/messenger/backups/daily-2026-07-28.sql.gz \
  | docker compose exec -T postgres psql -U messenger -d messenger
```

### 5 — Перезапустите API

```bash
docker compose start api
```

### 6 — Проверьте результат

```bash
curl https://chat.example.com/api/v1/health
# Ожидаемый результат: {"status":"ok"}

# Выборочно проверьте несколько строк
docker compose exec postgres psql -U messenger -d messenger \
  -c "SELECT COUNT(*) FROM messages;"
```

---

## Устранение неполадок

| Проблема | Решение |
|---------|-----|
| Контейнер `api` перезапускается | Проверьте `docker compose logs api` — обычно причина в неверной переменной окружения или в ещё не готовой базе данных |
| 502 Bad Gateway | API ещё запускается; подождите 30 секунд и повторите запрос |
| WebSocket отключается через 60 секунд | Убедитесь, что в конфигурации nginx указано `proxy_read_timeout 3600s` |
| TURN не работает | Проверьте правильность `EXTERNAL_IP` и открытые UDP-порты 3478 / 49152–65535 |
| Ошибка сертификата на Android | Убедитесь, что используется настоящий сертификат Certbot, а не самоподписанный |
| Скрипт резервного копирования завершается с ошибкой | Проверьте `/var/log/messenger-backup.log` и убедитесь, что контейнер postgres запущен (`docker compose ps`) |
| Восстановление: `DROP DATABASE` завершается ошибкой | Сначала остановите все сервисы (`docker compose stop api nginx`), чтобы не осталось активных подключений |

---

# English Version

# Deployment Guide — Family Messenger

**[Русская версия](#руководство-по-развёртыванию---семейный-мессенджер)**

This guide describes deploying the messenger on a clean VPS with Ubuntu using Docker Compose.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Step 1 — Clone Repository](#step-1--clone-repository)
- [Step 2 — Configure Environment Variables](#step-2--configure-environment-variables)
- [Step 3 — Configure Host Reverse Proxy](#step-3--configure-host-reverse-proxy)
- [Step 4 — Build and Start Stack](#step-4--build-and-start-stack)
- [Step 5 — Verify Deployment](#step-5--verify-deployment)
- [Step 6 — Configure Push Notifications (optional but recommended)](#step-6--configure-push-notifications-optional-but-recommended)
- [Step 7 — Create Users](#step-7--create-users)
- [Application Updates](#application-updates)
- [Phone Setup for Reliable Calls (Xiaomi / Samsung)](#phone-setup-for-reliable-calls-xiaomi--samsung)
- [Contact Visibility Configuration](#contact-visibility-configuration)
- [Useful Commands](#useful-commands)
- [Architecture Overview](#architecture-overview)
- [Certificate Expiry Notifications](#certificate-expiry-notifications)
- [Automatic Database Backup](#automatic-database-backup)
- [Database Restore](#database-restore)
- [Troubleshooting](#troubleshooting)

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Ubuntu | 22.04 LTS or 24.04 |
| Docker Engine | 24+ |
| Docker Compose Plugin | v2.20+ |
| Domain with DNS A record | Must point to your VPS IP |
| Open ports | 3478 (UDP) · 49152–65535 (UDP); ports 80/443 handled by host proxy |

### Install Docker (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 1 — Clone Repository

```bash
git clone <YOUR_REPO_URL> messenger
cd messenger
```

---

## Step 2 — Configure Environment Variables

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # or any other editor
```

Fill in all values:

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your public domain, e.g., `chat.example.com` |
| `POSTGRES_PASSWORD` | Strong random password (at least 32 chars) |
| `JWT_SECRET` | Random secret for JWT signing (at least 32 chars) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g., `7d` |
| `TURN_SECRET` | Random secret for TURN credentials (at least 32 chars) |
| `TURN_REALM` | Usually matches `DOMAIN` |
| `EXTERNAL_IP` | Your VPS public IP — run `curl -s https://ifconfig.me` |

Generate random secrets:
```bash
openssl rand -hex 32
```

---

## Step 3 — Configure Host Reverse Proxy

Messenger's nginx runs inside Docker on `127.0.0.1:7080` (HTTP only). Host reverse proxy serves TLS for `chat.example.com` and forwards traffic here.

### If host proxy is nginx (system service)

Create new site file, e.g., `/etc/nginx/sites-available/chat.example.com`:

```nginx
server {
    listen 443 ssl;
    server_name chat.example.com;

    ssl_certificate     /etc/letsencrypt/live/chat.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # WebSocket — must appear before /api/
    location /ws {
        proxy_pass         http://127.0.0.1:7080/ws;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location / {
        proxy_pass         http://127.0.0.1:7080;
        proxy_http_version 1.1;
        proxy_set_header   Host             $host;
        proxy_set_header   X-Real-IP        $remote_addr;
        proxy_set_header   X-Forwarded-For  $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}

server {
    listen 80;
    server_name chat.example.com;
    return 301 https://$host$request_uri;
}
```

Then enable site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/chat.example.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### If host proxy is Caddy

Add configuration to `Caddyfile`:

```
chat.example.com {
    reverse_proxy /ws 127.0.0.1:7080 {
        transport http {
            versions 1.1
        }
        header_up Upgrade {http.upgrade}
        header_up Connection "upgrade"
    }
    reverse_proxy 127.0.0.1:7080
}
```

Then reload Caddy: `sudo systemctl reload caddy`

### TLS Certificate for Host Proxy

If proxy doesn't have certificate for `chat.example.com` yet, get it via DNS challenge (no need to open ports):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --manual --preferred-challenges dns -d chat.example.com
```

Follow instructions: add TXT record, wait for verification, press Enter.

---

## Step 4 — Build and Start Stack

```bash
cd deploy
docker compose up -d --build
```

First build takes several minutes: downloads Node.js, installs pnpm, runs esbuild.

### Check Service Status

```bash
docker compose ps
docker compose logs -f api
```

All four services should have `healthy` or `running` status:

```
NAME       STATUS
postgres   healthy
api        healthy
coturn     running
nginx      healthy
```

---

## Step 5 — Verify Deployment

### Check Server Health

```bash
curl https://chat.example.com/api/v1/health
# Expected: {"status":"ok"}
```

### Test WebSocket Connection

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Version: 13" \
  https://chat.example.com/ws
# Expected: HTTP/1.1 101 Switching Protocols
```

---

## Step 6 — Configure Push Notifications (optional but recommended)

Push notifications allow family members to receive messages about new messages and calls even when app is in background or phone is locked.

### Overview

App uses **Expo Push Service → Google FCM** for Android notifications. Server doesn't need Firebase credentials: it calls Expo Push API (`exp.host/--/api/v2/push/send`), which forwards notifications to FCM.

### 6a — Create Firebase Project

1. Open [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, set name (e.g., `family-messenger`), disable Google Analytics (not needed), click **Create project**.
3. In project overview click **Android** icon (➕ Add app).
4. Specify **Android package name**: `com.ivaexpi.messengerandroid`
5. Nickname: `Family Messenger` (optional).
6. Click **Register app**, then **Download `google-services.json`**.
7. Skip rest of wizard: `expo-notifications` handles SDK setup.

### 6b — Add google-services.json to GitHub Actions Secrets

File `google-services.json` is auto-created during CI build. Save **entire contents** to GitHub secret:

```bash
# Output file contents
cat google-services.json
```

In GitHub repo open **Settings → Secrets and variables → Actions → New repository secret**:

| Secret Name | Value |
|-------------|-------|
| `GOOGLE_SERVICES_JSON` | Full contents of `google-services.json` |

Build workflow already has step to write this file before build.

### 6c — Add google-services.json to EAS Secrets (one-time)

For EAS cloud build, the file (local, in `.gitignore`) doesn't get into repo. Upload its contents to EAS project secret once:

```bash
cd artifacts/messenger-android
pnpm dlx eas-cli@latest secret:create \
  --scope project \
  --name GOOGLE_SERVICES_JSON \
  --type string \
  --value "$(cat google-services.json)"
```

After this, no need to run again. `app.config.js` gets secret at build time and creates `google-services.json` before `prebuild`.

### 6d — Link Firebase to Expo Project (one-time)

Expo push service must know Firebase project credentials to forward notifications. Run once on your machine:

```bash
cd artifacts/messenger-android
pnpm dlx eas-cli@latest credentials
# Select: Android → Manage FCM credentials → Upload FCM API key
```

Get **Server key** in Firebase Console → Project Settings → Cloud Messaging → **Cloud Messaging API (Legacy)** or use **Service Account** (API v1). Follow EAS prompts.

### Notes

- Notifications work only in **standalone APK builds** (including GitHub Actions). In Expo Go console shows `[Push] Registration skipped` — expected.
- `google-services.json` **contains no secrets**. Safe to add to repo if you don't want GitHub secret. Add exception `!artifacts/messenger-android/google-services.json` to `.gitignore`.
- If you skip this step entirely, app works normally but push notifications won't deliver in standalone mode.

### 6e — FCM Push Architecture for Incoming Calls

For calls, **direct FCM** via Firebase Admin SDK is used (not Expo Push Service). This allows precise control of payload and priority.

#### When Server Sends FCM Push

| Recipient State | Server Action |
|---|---|
| Online (active WebSocket) | Deliver via WS (`call.incoming`), push **not sent** |
| Offline / app killed | Send FCM data-push with `priority=high` |

This split guarantees exactly one system incoming call screen: WS and FCM never trigger `TelecomManager.addNewIncomingCall()` simultaneously.

#### FCM Message Structure for Call

```json
{
  "token": "<FCM device token>",
  "data": {
    "type": "call",
    "callId": "<uuid>",
    "callerId": "<userId>",
    "callerName": "<display name>"
  },
  "android": {
    "priority": "high",
    "ttl": 30000
  }
}
```

**Why data-only (no `notification` block):**
Android Firebase distinguishes two FCM message types:

- **Data-only** (only `data`, no `notification`): always triggers `FirebaseMessagingService.onMessageReceived()` — even when app killed. This is what incoming call needs: `CallFirebaseMessagingService` receives message and calls `TelecomManager.addNewIncomingCall()`.

- **Notification message** (has `notification` block): when app in background or killed, Android handles notification in system tray itself and **does not call** `onMessageReceived()`. `CallFirebaseMessagingService` won't get control, and system call screen won't open.

**`android.priority: "high"`** exempts push from standard Doze mode: Android wakes device and delivers message to `onMessageReceived()` even with locked screen — if app was **stopped normally** (by system or user swipe).

> **Limitation: force-stop**
> FCM high-priority data messages **don't guarantee** delivery to `onMessageReceived()` if user force-stopped app via Settings → Apps → Force stop. In this state Android blocks all incoming messages until next explicit app launch. This is considered unsupported edge case — app instructions should warn users not to use force stop.

> **Note on OEM devices (Xiaomi, Huawei, OPPO):** Battery managers of these vendors may additionally restrict background processes beyond standard Android. If call doesn't arrive with killed app, add app to battery optimization exceptions in device settings.

---

## Step 7 — Create Users

Run administrative CLI inside `api` container. Commands take flags, no interactive prompts.

```bash
# Create user (PIN must be exactly 6 digits)
docker compose exec api node /app/dist/admin.mjs create-user \
  --id alice --name "Alice" --pin 123456

# List all users
docker compose exec api node /app/dist/admin.mjs list-users

# Block / unblock user
docker compose exec api node /app/dist/admin.mjs block-user   --id alice
docker compose exec api node /app/dist/admin.mjs unblock-user --id alice
```

Available commands:

| Command | Required Flags |
|---------|---------------|
| `create-user` | `--id <userId>` `--name <name>` `--pin <6-digit-pin>` |
| `list-users` | — |
| `block-user` | `--id <userId>` |
| `unblock-user` | `--id <userId>` |
| `change-pin` | `--id <userId>` `--pin <6-digit-pin>` |
| `link-users` | `--a <userId>` `--b <userId>` |
| `unlink-users` | `--a <userId>` `--b <userId>` |
| `list-visibility` | — |
| `show-contacts` | `--id <userId>` |
| `reset-visibility` | `--id <userId>` |

---

## Phone Setup for Reliable Calls (Xiaomi / Samsung)

To prevent call drops when screen off and show incoming call on locked phone, do this setup once on each device. Vendors (especially Xiaomi) aggressively restrict background apps — without these permissions system may "freeze" messenger.

### Common for all Android (once after install)

1. **Calling account**: Settings → Apps → Phone (or Settings → Calls) → "Calling accounts" → enable "Family Messenger". Without this, system incoming call screen won't appear on locked phone.
2. On first app launch grant all requested permissions: microphone, notifications, phone.

### Xiaomi (MIUI / HyperOS)

Settings → Apps → All apps → "Family Messenger":

1. **Auto-start** — enable.
2. **Battery saver** — "No restrictions".
3. **Other permissions** → enable:
   - "Show on lock screen";
   - "Show pop-up windows";
   - "Show pop-up windows in background".
4. In recent apps (square menu) pull messenger card down and tap "lock" — protects app from being killed on memory clear.

### Samsung (One UI)

Settings → Apps → "Family Messenger":

1. **Battery** → "Unrestricted" (remove optimization).
2. Settings → Battery → "Background usage limits" → ensure messenger **not** in "Deep sleeping apps" or "Sleeping apps". If needed, add to "Never sleeping apps".
3. Messenger notifications — allow, including pop-ups.

### Verification

1. Call configured phone with locked screen — system call screen should appear; answering from it immediately connects call (no need to open app).
2. Accept call, turn off screen, wait 3–5 minutes — call shouldn't drop.
3. End call from one side — other side's call screen should close within seconds.

### Update after "Reliable Calls" Release

Changes affect both server and app — update both:

1. **Server** (on VPS):

```bash
cd /opt/messenger/deploy
git pull
docker compose up -d --build api
curl https://chat.example.com/api/v1/health
```

2. **App**: build new APK (EAS or GitHub Actions), deploy via `./deploy-update.sh "https://apk-link"` (see [Application Updates](#application-updates)) and install update on all phones.

3. After install verify points from "Verification" section above.

Order matters: server first, then clients. Old client with old server keeps working, but call fixes work fully only when both sides updated.

---

## Contact Visibility Configuration

By default all users see all others. To restrict list, run interactive CLI:

```bash
cd /opt/messenger
./deploy/admin-cli.sh
# select item 6 "Contact Visibility"
```

All settings symmetric. "Link A and B" makes them visible both ways, "unlink" hides both ways. One-way setup impossible. DB stores only hidden pairs; if no pair, users see each other.

Submenu options:

1. Show all actual mutually visible user pairs. List grouped by user and separated by lines. Since visibility symmetric, each pair shows from both sides:

```text
Current visible pairs:
Visible pairs (users who see each other):
------------------------------
  alice (Alice) ↔ bob (Bob)
  alice (Alice) ↔ ivan (Ivan)
  alice (Alice) ↔ test (Test)
------------------------------
  bob (Bob) ↔ alice (Alice)
  bob (Bob) ↔ ivan (Ivan)
  bob (Bob) ↔ test (Test)
------------------------------
  ivan (Ivan) ↔ alice (Alice)
  ivan (Ivan) ↔ bob (Bob)
```

2. Show selected user's contacts.
3. Link two users (show to each other).
4. Unlink two users (hide from each other).
5. Reset user restrictions. After this they see everyone again.

For automation, same commands directly:

```bash
docker compose exec api node /app/dist/admin.mjs link-users --a alice --b bob
docker compose exec api node /app/dist/admin.mjs unlink-users --a alice --b bob
docker compose exec api node /app/dist/admin.mjs list-visibility
docker compose exec api node /app/dist/admin.mjs show-contacts --id alice
docker compose exec api node /app/dist/admin.mjs reset-visibility --id alice
```

Change applies on next contact screen open in app. App restart not required.

---

## Application Updates

### Universal Instructions After Changes

In most updates only server code (`api`) changes. In this case no need to stop full stack and PostgreSQL:

```bash
cd /opt/messenger/deploy
git pull
docker compose up -d --build api
docker compose ps
curl https://chat.example.com/api/v1/health
```

Command rebuilds and restarts only `api`. PostgreSQL data untouched, `nginx` and `coturn` keep running uninterrupted.

#### Which Container to Update

| What Changed | Command |
|---|---|
| `artifacts/api-server`, API, WebSocket, migrations | `docker compose up -d --build api` |
| `deploy/nginx.conf` or files nginx serves | `docker compose up -d --force-recreate nginx` |
| `deploy/coturn.conf` or TURN settings | `docker compose up -d --force-recreate coturn` |
| `deploy/docker-compose.yml`, Dockerfile, or shared env vars | `docker compose up -d --build` |
| Multiple services or unsure what exactly changed | `docker compose up -d --build` |

After nginx update check local healthcheck:

```bash
curl http://127.0.0.1:7080/healthz
```

After `coturn` update check:

```bash
docker compose logs --tail=50 coturn
docker compose ps coturn
```

#### Full Restart

`docker compose down` needed only if you need to fully stop stack, networks/mounts changed, or regular `up -d --build` doesn't apply config. Safe full scenario without removing volumes:

```bash
cd /opt/messenger/deploy
git pull
docker compose down
docker compose up -d --build
docker compose ps
curl https://chat.example.com/api/v1/health
```

`docker compose down` doesn't delete PostgreSQL data unless you add `-v` flag. **Never use `docker compose down -v` for regular updates**: this removes Docker volumes and can destroy data if stored in volume. Current config has backups separately on host, but doesn't replace DB and backup verification.

#### Publish APK and version.json via deploy-update.sh

No container restart needed to publish APK. Nginx serves files from `/opt/messenger/updates/`, so just update APK in that folder.

Script `deploy/deploy-update.sh` runs **directly on VPS**. Given GitHub Actions artifact link it extracts ZIP and installs both files: APK and embedded `version.json`.

```bash
cd /opt/messenger/deploy
./deploy-update.sh "https://github.com/OWNER/REPO/actions/runs/RUN_ID/artifacts/ARTIFACT_ID"
```

Also accepts direct APK link from EAS Cloud or any CDN:

```bash
./deploy-update.sh "https://apk-link"
```

In direct link mode `version.json` not included in download and stays unchanged. For automatic metadata update use GitHub Actions artifact.

If run script without parameter, it prompts for link interactively:

```bash
./deploy-update.sh
Enter APK URL:
```

Script behavior:

1. Checks link starts with `http://` or `https://`.
2. If parameter missing or not URL, prompts again.
3. For GitHub Actions artifact downloads ZIP via GitHub API, finds APK and `version.json` regardless of nested path.
4. Validates `version.json` format and forbids rollback to lower `versionCode`.
5. Atomically replaces APK in `/opt/messenger/updates/messenger.apk`, then `version.json` in `/opt/messenger/updates/version.json`.
6. For direct link replaces only APK and keeps current `version.json`.

After this `deploy-update.sh` runs on VPS. To verify:

```bash
curl https://chat.example.com/updates/version.json
curl -I https://chat.example.com/updates/messenger.apk
```

No Docker container restart needed after APK publish.

---

## Useful Commands

```bash
# Watch logs in real time
docker compose logs -f

# Stop all services
docker compose down

# Stop services and remove all data (⚠ irreversible)
docker compose down -v

# Restart individual service
docker compose restart api
docker compose restart nginx

# Open database console
docker compose exec postgres psql -U messenger -d messenger
```

---

## Architecture Overview

```
Internet
   │
   ├── :80  ──────────────────────► nginx (HTTP → HTTPS redirect)
   ├── :443 ─────────────────────── nginx (TLS termination)
   │           /ws  ──────────────► api:3000  (WebSocket)
   │           /api/ ─────────────► api:3000  (REST)
   │
   └── :3478/udp ─────────────────► coturn (STUN/TURN relay)
       :49152-65535/udp ──────────► coturn (media relay)

Internal Docker network (messenger):
  nginx ──► api ──► postgres
```

---

## Certificate Expiry Notifications

Script `deploy/scripts/check-cert-expiry.sh` checks days until TLS certificate expires and sends notification if less than **14 days** remain. Run daily via cron to fix renewal in time and avoid messenger downtime.

### How It Works

1. If local cert file (`deploy/certs/fullchain.pem`) exists, script reads it; otherwise connects to live domain via `openssl s_client`.
2. Calculates days until certificate expiry.
3. If days **below threshold**, sends one or more notifications and exits with code 1 (so cron can also email root user).
4. If cert valid, logs OK line and exits with code 0.

### Configure Daily Cron Job

```bash
sudo crontab -e
```

Add task, adjusting path to match cloned repo location:

```cron
# Check certificate expiry every morning at 08:00
0 8 * * * DOMAIN=chat.example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Configure Notification Channel

Set variables in shell, `/etc/environment`, or add to cron line start.

#### Option A — Telegram (recommended, no SMTP needed)

1. Create bot: message [@BotFather](https://t.me/BotFather) → `/newbot` → copy token.
2. Start chat with bot (or add to group), then get chat ID:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -m json.tool | grep '"id"'
   ```
3. Add variables to crontab line:
   ```cron
   0 8 * * * DOMAIN=chat.example.com TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
   ```

#### Option B — Email

Requires `mailutils` (or compatible `mail` command) and configured MTA on host, e.g., Postfix with relay or `msmtp`:

```bash
sudo apt-get install -y mailutils
```

Then add `ALERT_EMAIL` to cron line:

```cron
0 8 * * * DOMAIN=chat.example.com ALERT_EMAIL=you@example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

Both channels can work simultaneously — set all four variables.

### Change Warning Threshold

Default threshold — 14 days. Override with `WARN_DAYS`:

```cron
0 8 * * * DOMAIN=chat.example.com WARN_DAYS=21 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Test Without Waiting

To force warning, temporarily set `WARN_DAYS` higher than actual days remaining:

```bash
DOMAIN=chat.example.com WARN_DAYS=999 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
  deploy/scripts/check-cert-expiry.sh
```

---

## Automatic Database Backup

Script `deploy/scripts/backup-postgres.sh` runs `pg_dump` inside running postgres container and writes compressed dump to host directory. No additional tools needed: uses `docker compose exec` available on host.

### Backup Rotation

| Type | Filename Pattern | Retention |
|------|-----------------|-----------|
| Daily | `daily-YYYY-MM-DD.sql.gz` | Last **7** dumps |
| Weekly | `weekly-YYYY-MM-DD.sql.gz` | Last **4** dumps (created on Sundays) |

By default backups written to `/opt/messenger/backups` (changeable via `BACKUP_DIR`). It's on **host filesystem**, outside all Docker volumes, so `docker compose down -v` and `docker volume prune` don't touch these files.

### Configure Daily Cron Job

```bash
sudo crontab -e
```

Add task, adjusting path to match cloned repo location:

```cron
# Create Postgres backup every night at 02:00
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

### Optional: Telegram Error Notification

If Telegram already used for cert expiry notifications, use same bot token and chat ID. Add both variables to cron line:

```cron
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy \
          TELEGRAM_BOT_TOKEN=<token> \
          TELEGRAM_CHAT_ID=<chat_id> \
          /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

Telegram message sent **only on error**; on success no notification sent, only log entry appears.

### Configuration Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPOSE_DIR` | Script directory | Directory containing `docker-compose.yml` |
| `BACKUP_DIR` | `/opt/messenger/backups` | Host directory for dump files |
| `KEEP_DAILY` | `7` | Number of daily dumps to keep |
| `KEEP_WEEKLY` | `4` | Number of weekly dumps to keep |
| `TELEGRAM_BOT_TOKEN` | *(empty)* | Bot token for error notifications |
| `TELEGRAM_CHAT_ID` | *(empty)* | Chat or user ID for error notifications |

### Manual Immediate Backup

```bash
COMPOSE_DIR=/path/to/messenger/deploy \
  /path/to/messenger/deploy/scripts/backup-postgres.sh
```

### Verify Backup Creation

```bash
ls -lh /opt/messenger/backups/
# Example output:
# -rw-r--r-- 1 root root  42K Jul 28 02:00 daily-2026-07-28.sql.gz
# -rw-r--r-- 1 root root  41K Jul 27 02:00 daily-2026-07-27.sql.gz
# -rw-r--r-- 1 root root  40K Jul 27 02:00 weekly-2026-07-27.sql.gz
```

### Off-VPS Copies (recommended)

For VPS loss protection periodically sync backup directory elsewhere, e.g., via `rsync`:

```bash
# Run daily or weekly from another computer / via cron
rsync -avz user@your-vps:/opt/messenger/backups/ ~/messenger-backups/
```

Also any cloud storage tool (`rclone`, `s3cmd`, `restic`, etc.) that can read host directory.

---

## Database Restore

Follow these steps to restore database from backup file.

### 1 — Select Backup File

```bash
ls -lht /opt/messenger/backups/
# Select file to restore, e.g., daily-2026-07-28.sql.gz
```

### 2 — Stop API to Prevent New Writes

```bash
cd /path/to/messenger/deploy
docker compose stop api
```

### 3 — Drop and Recreate Database

```bash
# Open psql console inside postgres container
docker compose exec postgres psql -U messenger -d postgres

-- Inside psql:
DROP DATABASE messenger;
CREATE DATABASE messenger OWNER messenger;
\q
```

### 4 — Restore Dump

```bash
# Decompress dump and pipe directly to psql inside container
gunzip -c /opt/messenger/backups/daily-2026-07-28.sql.gz \
  | docker compose exec -T postgres psql -U messenger -d messenger
```

### 5 — Restart API

```bash
docker compose start api
```

### 6 — Verify Result

```bash
curl https://chat.example.com/api/v1/health
# Expected: {"status":"ok"}

# Spot-check a few rows
docker compose exec postgres psql -U messenger -d messenger \
  -c "SELECT COUNT(*) FROM messages;"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `api` container restarts | Check `docker compose logs api` — usually wrong env var or DB not ready |
| 502 Bad Gateway | API still starting; wait 30 seconds and retry |
| WebSocket disconnects after 60 seconds | Ensure nginx config has `proxy_read_timeout 3600s` |
| TURN not working | Verify `EXTERNAL_IP` correct and UDP ports 3478 / 49152–65535 open |
| Certificate error on Android | Ensure real Certbot cert used, not self-signed |
| Backup script fails | Check `/var/log/messenger-backup.log` and ensure postgres container running (`docker compose ps`) |
| Restore: `DROP DATABASE` fails | Stop all services first (`docker compose stop api nginx`) to close active connections |
