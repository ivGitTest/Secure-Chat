# Messenger MVP
# Technical Requirements

Version: 1.1

Status: Approved

Purpose: Functional and technical requirements for MVP implementation.

---

# 1. Project Overview

## 1.1 Purpose

Develop a private self-hosted messenger for family use that supports:

- text messaging;
- voice calls;
- centralized message history.

The messenger is intended for deployment on a personal VPS and is not designed for public use.

The MVP is intended to validate:

- connection stability;
- voice quality;
- server architecture;
- deployment process.

---

# 2. Project Scope

## Included in MVP

### Authentication

- User login
- Device registration
- Session management

### Messaging

- One-to-one text messaging
- Real-time message delivery
- Message history synchronization

### Voice Calls

- One-to-one voice calls
- WebRTC
- TURN fallback

### Administration

- Manual user creation
- Manual user blocking/unblocking

### Logging

- Authentication events
- Connection events
- Calls
- Errors

---

## Not Included

The following functionality MUST NOT be implemented in MVP:

- group chats
- group calls
- push notifications
- photo messages
- video messages
- document transfer
- message reactions
- replies
- forwarding
- message editing
- message deletion
- avatars
- user profiles
- contact synchronization
- user search
- online status
- typing indicators
- read receipts
- user registration
- password recovery

---

# 3. Supported Platforms

## Client

Supported platform:

Android 10+

Technology stack:

- React Native
- Expo
- TypeScript

APK generation:

- Replit
- Expo
- EAS Build

The application is distributed only as APK.

Publishing to Google Play is outside the scope of MVP.

---

## Backend

Operating system:

Ubuntu Linux

Deployment:

Docker Compose

Reverse Proxy:

Nginx

Database:

PostgreSQL

---

# 4. Architecture

The system consists of:

- Android Client
- REST API
- WebSocket Server
- WebRTC Signaling Server
- TURN Server
- PostgreSQL Database

Business logic must not depend on transport implementation.

Transport must remain replaceable.

---

# 5. User Management

Only administrator-created users exist.

Self-registration is prohibited.

Each user contains:

| Field | Description |
|--------|-------------|
| UserID | Unique identifier |
| PIN | 6-digit authentication PIN |
| DeviceID | Registered Android device |

---

# 6. Authentication

Authentication requires:

- UserID
- PIN
- DeviceID

PIN requirements:

- exactly six digits;
- stored only as Argon2id hash.

Plaintext PIN storage is prohibited.

---

# 7. Account Blocking

After two consecutive incorrect PIN attempts:

- the account becomes blocked.

Blocked users:

- cannot authenticate;
- cannot restore history;
- cannot use the API.

Only an administrator can unblock the account.

Automatic unlock is prohibited.

---

# 8. Device Replacement

When a user changes a phone:

1. Install APK.
2. Authenticate.
3. Register the new DeviceID.
4. Restore message history.

The previous DeviceID is replaced.

---

# 9. Contacts

Phone contact synchronization is prohibited.

The server stores the complete list of users.

The client retrieves available contacts after successful authentication.

---

# 10. Messaging

Transport:

Secure WebSocket (WSS)

Requirements:

- real-time delivery;
- ordered messages;
- automatic reconnection;
- persistent history.

History is stored on the server.

---

# 11. Voice Calls

Technology:

WebRTC

Priority:

1. Connection stability
2. Voice quality
3. Low latency

Connection order:

1. Direct P2P
2. STUN
3. TURN Relay

If communication is still impossible, the user may manually enable VPN.

The application itself does not implement VPN.

---

# 12. Security

Transport encryption:

TLS

End-to-End Encryption:

Not implemented in MVP.

Messages are stored unencrypted in PostgreSQL.

---

# 13. REST API Responsibilities

REST API is used only for:

- authentication;
- configuration;
- history synchronization;
- health checks.

Real-time communication through REST is prohibited.

---

# 14. WebSocket Responsibilities

WebSocket is responsible for:

- real-time messaging;
- delivery acknowledgements;
- server events;
- WebRTC signaling.

---

# 15. Database

Database:

PostgreSQL

ORM:

Prisma

SQLite, MySQL and MongoDB are prohibited.

Required entities:

- Users
- Devices
- Conversations
- Messages
- Sessions
- CallLogs

---

# 16. Logging

The system must log:

Authentication:

- login success;
- login failure;
- account blocking.

Messaging:

- connection;
- disconnection;
- reconnection.

Voice:

- call start;
- call answer;
- call end;
- duration.

Infrastructure:

- API errors;
- database errors;
- WebSocket errors;
- signaling errors.

All logs must contain timestamps.

Sensitive information must never be logged.

---

# 17. Deployment

Target environment:

- Ubuntu
- Docker Compose
- PostgreSQL
- Nginx

Domain:

chat.naviry.xyz

Recommended containers:

- nginx
- api
- websocket
- signaling
- coturn
- postgres

---

# 18. Performance Targets

Maximum users:

30

Expected users:

10

Concurrent calls:

5

Target API response:

< 200 ms

Target login:

< 2 seconds

Target message delivery:

< 500 ms

---

# 19. Future Compatibility

The architecture must allow future addition of:

- photo messages;
- document transfer;
- message editing;
- forwarding;
- replies;
- push notifications;
- group voice calls.

Such functionality should not require redesign of the architecture.

---

# 20. Acceptance Criteria

The MVP is considered complete when:

- User authentication works.
- Device replacement restores history.
- Messages are delivered in real time.
- Message history survives reinstallation.
- Voice calls operate through WebRTC.
- TURN fallback works correctly.
- Logging is implemented.
- Docker deployment completes successfully.
- The entire system starts using a single `docker compose up -d` command.
- Android APK is successfully generated using Replit and Expo.
- The application supports at least 10 simultaneous users.