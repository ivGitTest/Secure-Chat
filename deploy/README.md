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
| Open ports | 80, 443 (TCP) · 3478 (UDP) · 49152-65535 (UDP) |

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

## Step 3 — Obtain a TLS certificate (Certbot)

Nginx expects the certificate at `deploy/certs/fullchain.pem` and the private key at `deploy/certs/privkey.pem`.

### Option A — Certbot standalone (recommended for first setup)

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d chat.naviry.xyz
```

Then link the files:

```bash
DOMAIN=chat.naviry.xyz
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem deploy/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem   deploy/certs/privkey.pem
sudo chown $USER deploy/certs/*.pem
```

### Option B — Self-signed certificate (testing only, not trusted by Android)

```bash
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout deploy/certs/privkey.pem \
  -out    deploy/certs/fullchain.pem \
  -subj   "/CN=chat.naviry.xyz"
```

### Certificate renewal

Add a cron job to renew and copy the certificate:

```bash
sudo crontab -e
# Add:
0 3 * * 1 certbot renew --quiet && \
  cp /etc/letsencrypt/live/chat.naviry.xyz/fullchain.pem /path/to/messenger/deploy/certs/fullchain.pem && \
  cp /etc/letsencrypt/live/chat.naviry.xyz/privkey.pem   /path/to/messenger/deploy/certs/privkey.pem && \
  docker compose -f /path/to/messenger/deploy/docker-compose.yml exec nginx nginx -s reload
```

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

## Step 6 — Create admin users

Run the admin CLI inside the api container:

```bash
docker compose exec api node /app/dist/admin.mjs create-user
# Prompts for userId, name, and PIN
```

Available commands:
```
create-user       Create a new user
block-user        Block a user account
unblock-user      Unblock a user account
list-users        List all users
```

---

## Updating the application

```bash
git pull
cd deploy
docker compose up -d --build api
```

This rebuilds and restarts only the api container; postgres data is preserved in the named volume.

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

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `api` container restarts | Check `docker compose logs api` — usually a bad env var or DB not ready |
| 502 Bad Gateway | Api is still starting; wait 30 s and retry |
| WebSocket drops after 60 s | Confirm `proxy_read_timeout 3600s` is in nginx config |
| TURN not working | Confirm `EXTERNAL_IP` is correct and UDP 3478 / 49152-65535 are open |
| Certificate error on Android | Ensure you used a real Certbot cert, not a self-signed one |
