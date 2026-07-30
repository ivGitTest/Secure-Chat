# Deployment Guide — Family Messenger

This guide walks you through deploying the messenger on a fresh Ubuntu VPS using Docker Compose.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Ubuntu | 22.04 LTS or 24.04 |
| Docker Engine | 24+ |
| Docker Compose Plugin | v2.20+ |
| A domain with DNS A record | Pointing to your VPS IP |
| Open ports | 3478 (UDP) · 49152-65535 (UDP) — ports 80/443 handled by host proxy |

### Install Docker (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 1 — Clone the repository

```bash
git clone <YOUR_REPO_URL> messenger
cd messenger
```

---

## Step 2 — Configure environment variables

```bash
cp deploy/.env.example deploy/.env
nano deploy/.env        # or any editor
```

Fill in every value:

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your public domain, e.g. `chat.naviry.xyz` |
| `POSTGRES_PASSWORD` | Strong random password (≥ 32 chars) |
| `JWT_SECRET` | Random secret for signing JWTs (≥ 32 chars) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d` |
| `TURN_SECRET` | Random secret for TURN credentials (≥ 32 chars) |
| `TURN_REALM` | Usually the same as `DOMAIN` |
| `EXTERNAL_IP` | Your VPS public IP — run `curl -s https://ifconfig.me` |

Generate random secrets:
```bash
openssl rand -hex 32
```

---

## Step 3 — Configure the host reverse proxy

The messenger's nginx runs inside Docker on `127.0.0.1:7080` (HTTP only).
Your host reverse proxy handles TLS for `chat.naviry.xyz` and forwards traffic here.

### If the host proxy is nginx (system service)

Add a new site file, e.g. `/etc/nginx/sites-available/chat.naviry.xyz`:

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

Then enable it and reload:

```bash
sudo ln -s /etc/nginx/sites-available/chat.naviry.xyz /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

### If the host proxy is Caddy

Add to your `Caddyfile`:

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

Then reload: `sudo systemctl reload caddy`

### TLS certificate for the host proxy

If the host proxy does not yet have a cert for `chat.naviry.xyz`, obtain one via DNS challenge (no ports needed):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --manual --preferred-challenges dns -d chat.naviry.xyz
```

Follow the prompts to add a TXT record, then verify and press Enter.

---

## Step 4 — Build and start the stack

```bash
cd deploy
docker compose up -d --build
```

The first build takes a few minutes (downloads Node.js, installs pnpm, runs esbuild).

### Check service status

```bash
docker compose ps
docker compose logs -f api
```

All four services should show `healthy` or `running`:

```
NAME       STATUS
postgres   healthy
api        healthy
coturn     running
nginx      healthy
```

---

## Step 5 — Verify the deployment

### Health check

```bash
curl https://chat.naviry.xyz/api/v1/health
# Expected: {"status":"ok"}
```

### WebSocket handshake

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  -H "Sec-WebSocket-Version: 13" \
  https://chat.naviry.xyz/ws
# Expected: HTTP/1.1 101 Switching Protocols
```

---

## Step 6 — Set up push notifications (optional but recommended)

Push notifications allow family members to receive alerts about new messages and calls even when the app is in the background or the phone is locked.

### Overview

The app uses **Expo Push Service → Google FCM** for Android notifications. The server needs no Firebase credentials — it calls the Expo Push API (`exp.host/--/api/v2/push/send`), which proxies to FCM on your behalf.

### 6a — Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with any Google account.
2. Click **Add project**, name it (e.g. `family-messenger`), disable Google Analytics (not needed), and click **Create project**.
3. In the project overview, click the **Android** icon (➕ Add app).
4. Enter the **Android package name**: `com.ivaexpi.messengerandroid`
5. Nickname: `Семейный мессенджер` (optional)
6. Click **Register app**, then **Download `google-services.json`**.
7. Skip the rest of the wizard (SDK setup is handled by `expo-notifications`).

### 6b — Add google-services.json to GitHub Secrets

The `google-services.json` file is automatically written during the CI build. Store its **entire contents** as a GitHub Secret:

```bash
# Copy the file contents
cat google-services.json
```

In your GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|-------------|-------|
| `GOOGLE_SERVICES_JSON` | Paste the full contents of `google-services.json` |

The build workflow already has the step to write this file before `eas build`.

### 6c — Connect Firebase to your Expo project (one-time)

Expo's push service needs to know your Firebase project's credentials to forward notifications. Run this once from your machine:

```bash
cd artifacts/messenger-android
npx eas credentials
# Select: Android → Manage FCM credentials → Upload FCM API key
```

Get the **Server key** from Firebase Console → Project Settings → Cloud Messaging → **Cloud Messaging API (Legacy)** or use the **Service Account** (v1 API). Follow the EAS prompts.

### Notes

- Notifications work only in **standalone APK builds** (from GitHub Actions). Expo Go shows `[Push] Registration skipped` in the console, which is expected.
- `google-services.json` does **not** contain secrets — it's safe to commit to the repo if you prefer not to use GitHub Secrets. Add `!artifacts/messenger-android/google-services.json` to `.gitignore` exceptions.
- If you skip this step entirely, the app works normally — push notifications just won't be delivered when offline.

---

## Step 7 — Create users

Run the admin CLI inside the api container. The CLI takes flags — there are no interactive prompts.

```bash
# Create a user (PIN must be exactly 6 digits)
docker compose exec api node /app/dist/admin.mjs create-user \
  --id alice --name "Alice" --pin 123456

# List all users
docker compose exec api node /app/dist/admin.mjs list-users

# Block / unblock a user
docker compose exec api node /app/dist/admin.mjs block-user   --id alice
docker compose exec api node /app/dist/admin.mjs unblock-user --id alice
```

Available commands:

| Command | Required flags |
|---------|---------------|
| `create-user` | `--id <userId>` `--name <name>` `--pin <6-digit-pin>` |
| `list-users` | — |
| `block-user` | `--id <userId>` |
| `unblock-user` | `--id <userId>` |

---

## Updating the application

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

#### Если обновились только файлы APK

Для выкладки APK контейнеры перезапускать не нужно. Достаточно скопировать
сгенерированные GitHub Actions `version.json` и APK в
`/opt/messenger/updates/`; nginx увидит файлы через
смонтированный каталог:

```bash
scp version.json vps:/opt/messenger/updates/
scp messenger-family.apk vps:/opt/messenger/updates/messenger.apk
curl https://chat.naviry.xyz/updates/version.json
```

---

## Useful commands

```bash
# View real-time logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove all data (⚠ irreversible)
docker compose down -v

# Restart a single service
docker compose restart api
docker compose restart nginx

# Open a database shell
docker compose exec postgres psql -U messenger -d messenger
```

---

## Architecture overview

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

## Certificate expiry alerts

The script `deploy/scripts/check-cert-expiry.sh` checks how many days remain on the TLS certificate and sends an alert when fewer than **14 days** are left.  Run it daily from cron so you always have plenty of lead time to fix a failed renewal before the messenger goes dark.

### How it works

1. Reads the local certificate file (`deploy/certs/fullchain.pem`) if it exists; otherwise connects to the live domain with `openssl s_client`.
2. Calculates the number of days until expiry.
3. If the count is **below the threshold** it sends one or more alerts and exits with code 1 (so cron can also mail root).
4. If the cert is still healthy it logs an OK line and exits with code 0.

### Set up the daily cron job

```bash
sudo crontab -e
```

Add (adjust the path to match where you cloned the repo):

```cron
# Check cert expiry every morning at 08:00
0 8 * * * DOMAIN=chat.naviry.xyz /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Configure a notification channel

Set the variables in your shell, in `/etc/environment`, or prepend them on the cron line.

#### Option A — Telegram (recommended, no SMTP needed)

1. Create a bot: message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. Start a chat with your bot (or add it to a group), then get the chat ID:
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -m json.tool | grep '"id"'
   ```
3. Set the variables in your crontab line:
   ```cron
   0 8 * * * DOMAIN=chat.naviry.xyz TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
   ```

#### Option B — Email

Requires `mailutils` (or a compatible `mail` command) and a configured MTA on the host (e.g. Postfix with a relay, or `msmtp`):

```bash
sudo apt-get install -y mailutils
```

Then add `ALERT_EMAIL` to the cron line:

```cron
0 8 * * * DOMAIN=chat.naviry.xyz ALERT_EMAIL=you@example.com /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

Both channels can be active at the same time — just set all four variables.

### Tune the warning threshold

The default threshold is 14 days.  Override it with `WARN_DAYS`:

```cron
0 8 * * * DOMAIN=chat.naviry.xyz WARN_DAYS=21 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> /path/to/messenger/deploy/scripts/check-cert-expiry.sh >> /var/log/check-cert-expiry.log 2>&1
```

### Test without waiting

Force a warning by temporarily setting `WARN_DAYS` higher than the actual days remaining:

```bash
DOMAIN=chat.naviry.xyz WARN_DAYS=999 TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat_id> \
  deploy/scripts/check-cert-expiry.sh
```

---

## Automated database backups

The script `deploy/scripts/backup-postgres.sh` runs `pg_dump` inside the running postgres container and writes a compressed dump to a host directory.  No extra tooling is required — it uses the `docker compose exec` command already available on the host.

### Backup rotation

| Type | Filename pattern | Retained |
|------|-----------------|----------|
| Daily | `daily-YYYY-MM-DD.sql.gz` | Last **7** dumps |
| Weekly | `weekly-YYYY-MM-DD.sql.gz` | Last **4** dumps (taken on Sundays) |

Backups are written to `/opt/messenger/backups` by default (configurable via `BACKUP_DIR`).  The directory is on the **host filesystem**, outside every Docker volume, so `docker compose down -v` or `docker volume prune` cannot touch it.

### Set up the daily cron job

```bash
sudo crontab -e
```

Add (adjust the path to match where you cloned the repo):

```cron
# Backup Postgres every night at 02:00
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

### Optional: Telegram alert on failure

If you also use Telegram for cert-expiry alerts, reuse the same bot token and chat ID.  Add both variables to the cron line:

```cron
0 2 * * * COMPOSE_DIR=/path/to/messenger/deploy \
          TELEGRAM_BOT_TOKEN=<token> \
          TELEGRAM_CHAT_ID=<chat_id> \
          /path/to/messenger/deploy/scripts/backup-postgres.sh >> /var/log/messenger-backup.log 2>&1
```

A Telegram message is sent **only on failure**; a successful run is silent (logged to the log file only).

### Configuration variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPOSE_DIR` | Script's parent directory | Directory containing `docker-compose.yml` |
| `BACKUP_DIR` | `/opt/messenger/backups` | Host directory for dump files |
| `KEEP_DAILY` | `7` | Number of daily dumps to keep |
| `KEEP_WEEKLY` | `4` | Number of weekly dumps to keep |
| `TELEGRAM_BOT_TOKEN` | *(empty)* | Bot token for failure alerts |
| `TELEGRAM_CHAT_ID` | *(empty)* | Chat/user ID for failure alerts |

### Run a manual backup immediately

```bash
COMPOSE_DIR=/path/to/messenger/deploy \
  /path/to/messenger/deploy/scripts/backup-postgres.sh
```

### Verify backups are being created

```bash
ls -lh /opt/messenger/backups/
# Example output:
# -rw-r--r-- 1 root root  42K Jul 28 02:00 daily-2026-07-28.sql.gz
# -rw-r--r-- 1 root root  41K Jul 27 02:00 daily-2026-07-27.sql.gz
# -rw-r--r-- 1 root root  40K Jul 27 02:00 weekly-2026-07-27.sql.gz
```

### Off-VPS copies (recommended)

For full protection against VPS loss, periodically sync the backup directory to another location, for example using `rsync`:

```bash
# Run daily or weekly from a separate machine / cron job
rsync -avz user@your-vps:/opt/messenger/backups/ ~/messenger-backups/
```

Or use any cloud storage tool (`rclone`, `s3cmd`, `restic`, etc.) that can read the host directory.

---

## Restore procedure

Follow these steps to restore the database from a backup file.

### 1 — Choose a backup file

```bash
ls -lht /opt/messenger/backups/
# Pick the file you want to restore, e.g. daily-2026-07-28.sql.gz
```

### 2 — Stop the API so no new writes arrive

```bash
cd /path/to/messenger/deploy
docker compose stop api
```

### 3 — Drop and recreate the database

```bash
# Open a psql shell inside the postgres container
docker compose exec postgres psql -U messenger -d postgres

-- Inside psql:
DROP DATABASE messenger;
CREATE DATABASE messenger OWNER messenger;
\q
```

### 4 — Restore the dump

```bash
# Decompress and pipe directly into psql inside the container
gunzip -c /opt/messenger/backups/daily-2026-07-28.sql.gz \
  | docker compose exec -T postgres psql -U messenger -d messenger
```

### 5 — Restart the API

```bash
docker compose start api
```

### 6 — Verify

```bash
curl https://chat.naviry.xyz/api/v1/health
# Expected: {"status":"ok"}

# Spot-check a few rows
docker compose exec postgres psql -U messenger -d messenger \
  -c "SELECT COUNT(*) FROM messages;"
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `api` container restarts | Check `docker compose logs api` — usually a bad env var or DB not ready |
| 502 Bad Gateway | Api is still starting; wait 30 s and retry |
| WebSocket drops after 60 s | Confirm `proxy_read_timeout 3600s` is in nginx config |
| TURN not working | Confirm `EXTERNAL_IP` is correct and UDP 3478 / 49152-65535 are open |
| Certificate error on Android | Ensure you used a real Certbot cert, not a self-signed one |
| Backup script exits with error | Check `/var/log/messenger-backup.log`; ensure the postgres container is running (`docker compose ps`) |
| Restore: `DROP DATABASE` fails | Stop all services first (`docker compose stop api nginx`) so no connections remain |
