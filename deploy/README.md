# Руководство по развёртыванию — Семейный мессенджер

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
| `DOMAIN` | Ваш публичный домен, например `chat.naviry.xyz` |
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
Обратный прокси на хосте обслуживает TLS для `chat.naviry.xyz` и перенаправляет сюда трафик.

### Если прокси на хосте — nginx (системный сервис)

Создайте файл нового сайта, например `/etc/nginx/sites-available/chat.naviry.xyz`:

```nginx
server {
    listen 443 ssl;
    server_name chat.naviry.xyz;

    ssl_certificate     /etc/letsencrypt/live/chat.naviry.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.naviry.xyz/privkey.pem;
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
    server_name chat.naviry.xyz;
    return 301 https://$host$request_uri;
}
```

Затем включите сайт и перезагрузите nginx:

```bash
sudo ln -s /etc/nginx/sites-available/chat.naviry.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### Если прокси на хосте — Caddy

Добавьте конфигурацию в `Caddyfile`:

```
chat.naviry.xyz {
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

Если у прокси ещё нет сертификата для `chat.naviry.xyz`, получите его через DNS-проверку (открывать порты не требуется):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --manual --preferred-challenges dns -d chat.naviry.xyz
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
curl https://chat.naviry.xyz/api/v1/health
# Ожидаемый результат: {"status":"ok"}
```

### Установка WebSocket-соединения

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Version: 13" \
  https://chat.naviry.xyz/ws
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
   curl https://chat.naviry.xyz/api/v1/health
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
curl https://chat.naviry.xyz/api/v1/health
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
curl https://chat.naviry.xyz/api/v1/health
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
curl https://chat.naviry.xyz/updates/version.json
curl -I https://chat.naviry.xyz/updates/messenger.apk
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
0 8 * * * DOMAIN=chat.naviry.xyz /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
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
   0 8 * * * DOMAIN=chat.naviry.xyz TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
   ```

#### Вариант B — электронная почта

Требуется `mailutils` (или совместимая команда `mail`) и настроенный MTA на хосте, например Postfix с relay или `msmtp`:

```bash
sudo apt-get install -y mailutils
```

Затем добавьте `ALERT_EMAIL` в строку cron:

```cron
0 8 * * * DOMAIN=chat.naviry.xyz ALERT_EMAIL=you@example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

Оба канала могут работать одновременно — задайте все четыре переменные.

### Изменение порога предупреждения

Порог по умолчанию — 14 дней. Переопределите его с помощью `WARN_DAYS`:

```cron
0 8 * * * DOMAIN=chat.naviry.xyz WARN_DAYS=21 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Проверка без ожидания

Чтобы принудительно получить предупреждение, временно задайте для `WARN_DAYS` значение больше фактического количества оставшихся дней:

```bash
DOMAIN=chat.naviry.xyz WARN_DAYS=999 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
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
curl https://chat.naviry.xyz/api/v1/health
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
