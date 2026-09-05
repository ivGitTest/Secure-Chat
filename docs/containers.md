# Описание контейнеров

**[English version](#english-version)**

Стек развёрнут через Docker Compose (`deploy/docker-compose.yml`).  
Все контейнеры, кроме `coturn`, общаются по внутренней сети `messenger` (bridge).

---

## Оглавление

- [postgres](#postgres)
- [api](#api)
- [coturn](#coturn)
- [nginx](#nginx)
- [Схема взаимодействия](#схема-взаимодействия)
- [Тома и сеть](#тома-и-сеть)

## postgres

**Образ:** `postgres:16-alpine`

Реляционная база данных. Хранит всё постоянное состояние приложения: пользователей, сессии, чаты, сообщения, историю звонков. Данные персистируются в именованном томе `postgres-data` — они сохраняются между перезапусками контейнера и обновлениями стека.

**Зависимости:** ничего.  
**Healthcheck:** `pg_isready` каждые 10 с. Контейнер `api` не стартует, пока postgres не станет healthy.

---

## api

**Образ:** собирается из `deploy/api/Dockerfile` (Node 22, бандл через esbuild).

Основной бэкенд. Обрабатывает все запросы от мобильного приложения:

- **REST API** — авторизация по PIN, список пользователей, история сообщений, конфигурация TURN.
- **WebSocket** — приём и доставка сообщений в реальном времени, управление звонками.
- **WebRTC-сигналинг** — ретрансляция SDP offer/answer и ICE-кандидатов между участниками звонка.

При старте контейнера `entrypoint.sh` сначала запускает `dist/migrate.mjs` (применяет DDL-миграции к БД), затем поднимает `dist/server.mjs`.

**Зависимости:** postgres (service_healthy).  
**Healthcheck:** `GET http://localhost:3000/api/v1/health` каждые 30 с. Контейнер `nginx` не стартует, пока api не станет healthy.

---

## coturn

**Образ:** `coturn/coturn:latest`

STUN/TURN-сервер для WebRTC. Нужен для того, чтобы видео- и голосовые звонки проходили даже когда оба устройства находятся за NAT (домашний роутер, мобильный оператор). STUN помогает устройству узнать свой внешний IP, TURN — ретранслирует медиапоток, если прямое P2P-соединение установить невозможно.

Запускается в режиме `network_mode: host` — контейнер напрямую использует сетевой стек хоста. Это обязательно: coturn открывает тысячи эфемерных UDP-портов для медиарелея, и проброс такого диапазона через Docker-порты нецелесообразен.

**Зависимости:** ничего.  
**Healthcheck:** `pidof turnserver` каждые 30 с.

---

## nginx

**Образ:** `nginx:alpine`

Reverse-proxy внутри стека. Принимает трафик на `127.0.0.1:7080` (только с localhost хоста) и проксирует его в контейнер `api`. HTTP-only: TLS-терминацию выполняет системный nginx хоста.

Нужен для того, чтобы:
- разделить сетевые слои (системный nginx хоста ↔ стек),
- корректно передавать заголовки `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`,
- обслуживать WebSocket-апгрейд (`/ws`) с правильными заголовками `Upgrade` / `Connection`.

**Зависимости:** api (service_healthy).  
**Healthcheck:** `wget http://localhost/healthz` каждые 30 с.

---

## Схема взаимодействия

```
Интернет
   │
   ▼
Системный nginx хоста (порты 80/443, TLS)
   │  proxy_pass http://127.0.0.1:7080
   ▼
[docker] nginx :7080
   │  proxy_pass http://api:3000
   ▼
[docker] api :3000
   │
   ├── SELECT/INSERT → [docker] postgres :5432
   │
   └── /api/v1/config → адреса STUN/TURN
            │
            ▼
[host network] coturn :3478 (UDP/TCP)
```

---

## Тома и сеть

| Том / сеть | Тип | Назначение |
|---|---|---|
| `${POSTGRES_DATA_DIR}` (bind mount) | host directory | Данные PostgreSQL — хранятся на хосте, не затрагиваются никакими командами Docker |
| `messenger` | bridge network | Внутренняя сеть контейнеров |

Котейнер `coturn` не подключён к сети `messenger` — он использует `network_mode: host` и общается с клиентами напрямую через сетевой стек хоста.

---

# English Version

# Container Description

**[Русская версия](#описание-контейнеров)**

Stack deployed via Docker Compose (`deploy/docker-compose.yml`).  
All containers except `coturn` communicate over internal `messenger` network (bridge).

---

## Table of Contents

- [postgres](#postgres)
- [api](#api)
- [coturn](#coturn)
- [nginx](#nginx)
- [Interaction Schema](#interaction-schema)
- [Volumes and Network](#volumes-and-network)

## postgres

**Image:** `postgres:16-alpine`

Relational database. Stores all persistent app state: users, sessions, chats, messages, call history. Data persisted in named volume `postgres-data` — survives container restarts and stack updates.

**Dependencies:** none.  
**Healthcheck:** `pg_isready` every 10s. `api` container won't start until postgres is healthy.

---

## api

**Image:** built from `deploy/api/Dockerfile` (Node 22, esbuild bundle).

Main backend. Handles all requests from mobile app:

- **REST API** — PIN auth, user list, message history, TURN config.
- **WebSocket** — real-time message delivery, call management.
- **WebRTC signaling** — relay SDP offer/answer and ICE candidates between call participants.

On container start `entrypoint.sh` first runs `dist/migrate.mjs` (applies DDL migrations to DB), then starts `dist/server.mjs`.

**Dependencies:** postgres (service_healthy).  
**Healthcheck:** `GET http://localhost:3000/api/v1/health` every 30s. `nginx` container won't start until api is healthy.

---

## coturn

**Image:** `coturn/coturn:latest`

STUN/TURN server for WebRTC. Needed so voice/video calls work even when both devices behind NAT (home router, mobile carrier). STUN helps device discover its public IP, TURN relays media stream when direct P2P connection impossible.

Runs in `network_mode: host` — container directly uses host network stack. Mandatory: coturn opens thousands of ephemeral UDP ports for media relay, proxying such range through Docker ports impractical.

**Dependencies:** none.  
**Healthcheck:** `pidof turnserver` every 30s.

---

## nginx

**Image:** `nginx:alpine`

Reverse proxy inside stack. Accepts traffic on `127.0.0.1:7080` (from host localhost only) and proxies to `api` container. HTTP-only: TLS termination done by host system nginx.

Needed to:
- separate network layers (host system nginx ↔ stack),
- correctly pass `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` headers,
- serve WebSocket upgrade (`/ws`) with proper `Upgrade` / `Connection` headers.

**Dependencies:** api (service_healthy).  
**Healthcheck:** `wget http://localhost/healthz` every 30s.

---

## Interaction Schema

```
Internet
   │
   ▼
Host system nginx (ports 80/443, TLS)
   │  proxy_pass http://127.0.0.1:7080
   ▼
[docker] nginx :7080
   │  proxy_pass http://api:3000
   ▼
[docker] api :3000
   │
   ├── SELECT/INSERT → [docker] postgres :5432
   │
   └── /api/v1/config → STUN/TURN addresses
            │
            ▼
[host network] coturn :3478 (UDP/TCP)
```

---

## Volumes and Network

| Volume / Network | Type | Purpose |
|---|---|---|
| `${POSTGRES_DATA_DIR}` (bind mount) | host directory | PostgreSQL data — stored on host, untouched by any Docker commands |
| `messenger` | bridge network | Internal container network |

Container `coturn` not connected to `messenger` network — uses `network_mode: host` and communicates with clients directly via host network stack.
