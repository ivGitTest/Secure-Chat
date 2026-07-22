# Family Messenger

A self-hosted, private messaging app for families. Designed for 10–30 people who want to own their data and avoid dependence on third-party cloud services.

> **Status: MVP.** This is a working baseline for a closed family circle. It covers secure login, one-to-one and group text chats, voice calls, and a Docker-based deployment you can run on a personal VPS.

---

## What it does

- **Private, self-hosted chat.** Text messaging inside the family or close group with no ads, no data mining, and no external accounts.
- **One-to-one and group conversations.** Create conversations with any registered members and keep all history under your control.
- **Voice calls.** WebRTC-based voice calls between users, relayed by a built-in TURN server.
- **Simple 6-digit PIN login.** No passwords to forget. Each user gets a 6-digit PIN stored as an argon2 hash.
- **Android app.** A React Native (Expo) client for family members to install directly.
- **Admin CLI.** Create, block, and unblock users through a command-line tool.

## What is not in MVP (planned for later)

- Push notifications
- File attachments and media
- Message search
- Group admin roles
- End-to-end encryption (server sees messages in this version)
- iOS build
- Automatic backups
- Expiry monitoring for TLS certificates

---

## Tech stack

### Backend
- **Node.js 20 + TypeScript 5**
- **Express 5** — REST API
- **WebSocket (`ws`)** — real-time messaging, call signaling, WebRTC offer/answer/ICE relay
- **Drizzle ORM** — PostgreSQL schema and queries
- **argon2** — PIN hashing
- **JWT** — session tokens
- **pino** — structured logging
- **esbuild** — single-file bundle for production Docker image

### Infrastructure
- **Docker + Docker Compose**
- **PostgreSQL 16**
- **nginx** — TLS termination, reverse proxy, WebSocket upgrade
- **coturn** — STUN/TURN server for WebRTC media relay
- **Certbot** — TLS certificates (Let's Encrypt)

### Android client
- **Expo SDK 52 + React Native**
- **react-native-webrtc** — WebRTC on Android
- **expo-secure-store** — token storage
- **AsyncStorage** — local settings (server URL, etc.)

---

## Repository layout

```
artifacts/api-server/        # Express server (REST + WebSocket + WebRTC signaling)
artifacts/messenger-android/   # Expo React Native Android client
lib/db/                      # Drizzle schema + db connection
lib/api-zod/                 # Shared Zod schemas
scripts/                     # Admin CLI and utilities
deploy/                      # Docker Compose, nginx, coturn, Dockerfile, README
```

---

## Quick start (development)

### Requirements
- Node.js 20
- pnpm (with corepack)
- PostgreSQL (local or cloud)

### 1. Install dependencies
```bash
pnpm install
```

### 2. Set environment variables
```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env  # or export directly
```

Required:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` or `SESSION_SECRET` — used to sign JWTs
- `PORT` — e.g. `5000`

Optional:
- `JWT_EXPIRES_IN` — e.g. `7d` (supports `s`, `m`, `h`, `d`, `w`)
- `LOG_LEVEL` — `trace | debug | info | warn | error`

### 3. Push the database schema
```bash
pnpm --filter @workspace/db run push
```

### 4. Create a user
```bash
pnpm --filter @workspace/scripts run admin -- create-user --id alice --name Alice --pin 123456
```

### 5. Start the API server
```bash
pnpm --filter @workspace/api-server run dev
```

The API will be available at `http://localhost:5000`.

### 6. Start the Android client
```bash
pnpm --filter @workspace/messenger-android run dev
```

In the Expo app, enter your local server URL: `http://<your-computer-ip>:5000`.

---

## Production deployment

See [`deploy/README.md`](deploy/README.md) for the full VPS deployment guide.

Short version:
1. Copy `deploy/.env.example` to `deploy/.env` and fill in values.
2. Obtain TLS certificates with Certbot.
3. Run `cd deploy && docker compose up -d --build`.
4. Create users with `docker compose exec api node /app/dist/admin.mjs create-user`.

---

## Admin CLI

The CLI is available as a workspace script in development and as a bundled script inside the Docker image in production.

```bash
# Development
pnpm --filter @workspace/scripts run admin -- create-user --id alice --name Alice --pin 123456
pnpm --filter @workspace/scripts run admin -- block-user --id alice
pnpm --filter @workspace/scripts run admin -- unblock-user --id alice
pnpm --filter @workspace/scripts run admin -- list-users

# Production (inside the api container)
docker compose exec api node /app/dist/admin.mjs create-user --id alice --name Alice --pin 123456
```

---

## Security notes

- Server stores messages in plain text in PostgreSQL. **MVP is not end-to-end encrypted.** Keep the server on a machine you trust and protect the database.
- PINs are hashed with argon2id.
- Failed login attempts are tracked; after a small threshold the account is blocked.
- JWTs are signed with `JWT_SECRET` (preferred) or `SESSION_SECRET` (fallback).
- API rate limits: 5 login attempts per minute per IP, 120 authenticated requests per minute per user.

---

## License

This is a personal, self-hosted project. It is provided as-is for family use.

---

## Roadmap

Planned next steps:
- Build and distribute the Android APK
- Automated TLS certificate renewal
- Message history backups
- Certificate expiry warnings
- Push notifications
- End-to-end encryption research
