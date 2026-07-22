# AI Development Rules
# Replit AI Agent Instructions

Version: 1.1

Status: Mandatory

Purpose: These rules define how the AI development agent must behave while implementing the Messenger MVP. These instructions have higher priority than any AI-generated assumptions or optimizations.

---

# 1. General Principles

The AI Agent is an implementation assistant.

The AI Agent MUST implement only the approved requirements.

The AI Agent MUST NOT make product or architectural decisions independently.

If any requirement is ambiguous, the AI Agent must stop and request clarification.

Never guess.

---

# 2. Source of Truth

The following documents are authoritative:

1. 01_MVP_Technical_Requirements.md
2. 02_AI_Development_Rules.md
3. 03_API_Specification.md
4. 06_Android_Client_Specification.md

Documentation always overrides assumptions.

Generated code must strictly follow these documents.

---

# 3. Approval Policy

The AI Agent MUST obtain approval before:

- changing architecture;
- introducing new libraries;
- changing database schema;
- changing API contracts;
- changing authentication;
- changing deployment strategy;
- introducing background services;
- replacing approved technologies.

No architectural changes are allowed without explicit approval.

---

# 4. Technology Stack

## Mobile Client

Mandatory:

- React Native
- Expo
- TypeScript
- Expo Router
- Expo Secure Store
- React Native WebRTC

APK generation:

- Replit
- Expo
- EAS Build

---

## Backend

Mandatory:

- Node.js LTS
- TypeScript
- Fastify
- ws
- Prisma
- PostgreSQL

---

## Voice

Mandatory:

- WebRTC
- coturn

---

## Reverse Proxy

Mandatory:

- Nginx

---

## Deployment

Mandatory:

- Docker Compose

---

# 5. Forbidden Technologies

The AI Agent MUST NOT introduce:

## Mobile

- Native Android (Kotlin)
- Java
- Flutter
- Ionic
- Xamarin

## Backend

- JavaScript
- Express.js
- Socket.IO
- NestJS
- Firebase
- MongoDB
- MySQL
- SQLite
- Sequelize
- TypeORM
- Redis (unless approved)
- GraphQL
- RabbitMQ
- Kafka
- Kubernetes
- Caddy

No technology substitutions are allowed.

---

# 6. TypeScript Rules

All projects must use strict TypeScript.

Mandatory:

- strict
- strictNullChecks
- noImplicitAny

Forbidden:

- any
- @ts-ignore
- @ts-nocheck

Every exported function must have explicit typing.

---

# 7. Architecture Rules

The project consists of two independent applications:

- Mobile Client
- Backend

Both applications must remain loosely coupled.

Communication is allowed only through documented APIs.

Business logic must not depend directly on:

- WebSocket implementation
- Prisma
- PostgreSQL
- Expo APIs

Always use abstraction where appropriate.

---

# 8. React Native Rules

Prefer Expo SDK over third-party packages.

Before adding a dependency verify:

1. Expo does not already provide the feature.
2. React Native does not already provide the feature.

Avoid unnecessary packages.

Use functional components only.

Use React Hooks.

Class components are prohibited.

---

# 9. UI Rules

The UI is not a priority.

Use:

- standard React Native components;
- standard Expo components;
- default dialogs;
- default ActivityIndicator;
- Expo Vector Icons.

Avoid:

- custom animations;
- custom controls;
- complex layouts;
- unnecessary styling.

Simple is preferred over beautiful.

---

# 10. Navigation Rules

Use:

Expo Router.

Do not implement:

- Bottom Navigation
- Drawer
- Deep Links
- Nested navigation unless required

Navigation should remain as simple as possible.

---

# 11. State Management

For MVP use only:

- React Hooks
- Context API

Redux, MobX, Zustand and similar libraries are prohibited unless approved.

---

# 12. Local Storage

Allowed:

- Expo Secure Store
- AsyncStorage (non-sensitive data only)

Sensitive data:

- Access Token

must only be stored in Secure Store.

Never store:

- PIN
- Secrets

---

# 13. Networking

REST API:

- authentication;
- synchronization;
- configuration.

WebSocket:

- messaging;
- signaling.

WebRTC:

- voice.

The AI Agent must never move messaging to REST polling.

---

# 14. Dependency Management

Before installing any package:

- check Expo SDK;
- check React Native;
- check existing dependencies.

Every additional dependency requires justification.

Avoid dependency bloat.

---

# 15. Database Rules

Mandatory:

- PostgreSQL
- Prisma

Every schema change must include a migration.

Raw SQL should be avoided whenever Prisma supports the operation.

---

# 16. Docker Rules

Each backend service must:

- have a dedicated container;
- expose health checks;
- define restart policy;
- have a single responsibility.

---

# 17. Logging

Log:

- authentication;
- connections;
- WebSocket lifecycle;
- API errors;
- signaling;
- calls.

Never log:

- PIN;
- Access Token;
- JWT;
- Secrets;
- DeviceID.

---

# 18. Error Handling

Never ignore exceptions.

Every exception must:

- be logged;
- return an appropriate error;
- avoid exposing implementation details.

---

# 19. Refactoring Policy

The AI Agent MUST NOT:

- rename files;
- reorganize directories;
- refactor working code;
- improve architecture;
- optimize performance

unless explicitly requested.

Only implement the requested feature.

---

# 20. Development Workflow

For every task:

1. Read requirements.
2. Explain implementation plan.
3. Wait for approval if architecture changes.
4. Implement.
5. Run lint.
6. Run tests.
7. Verify build.
8. Explain completed work.

---

# 21. Build Verification

Every completed change must successfully pass:

Backend:

- TypeScript compilation
- ESLint
- Tests

Frontend:

- Expo type checking
- Expo lint
- Expo build verification

The AI Agent must never report a feature as complete without successful build verification.

---

# 22. Documentation

Whenever implementation changes:

- API;
- database;
- configuration;
- deployment;

the corresponding documentation must also be updated.

---

# 23. Communication Style

The AI Agent should:

- be concise;
- distinguish facts from assumptions;
- explain technical decisions briefly;
- ask questions instead of guessing.

---

# 24. Performance

Optimize only after correctness.

Priority:

1. Correctness
2. Simplicity
3. Maintainability
4. Performance

Premature optimization is prohibited.

---

# 25. Task Completion

A task is complete only if:

- implementation matches requirements;
- project builds successfully;
- lint passes;
- tests pass;
- documentation is updated;
- no known critical defects remain.

---

# 26. Non-Negotiable Rules

The following rules are absolute:

- Do not change architecture without approval.
- Do not introduce new technologies without approval.
- Use React Native + Expo only.
- Use TypeScript only.
- Use strict TypeScript.
- Never use JavaScript.
- Never use Kotlin.
- Never use Flutter.
- Never use Socket.IO.
- Never use Firebase.
- Never use SQLite.
- Never use MongoDB.
- Never use MySQL.
- Use PostgreSQL only.
- Use Prisma as the only ORM.
- Use Fastify for the REST API.
- Use WebSocket (`ws`) for messaging.
- Use WebRTC for voice calls.
- Never store plaintext PINs.
- Never hardcode secrets.
- Never refactor without request.
- Never rename or delete files without approval.
- Prefer Expo SDK over third-party libraries.
- Always verify the build before declaring a task complete.
- Keep documentation synchronized with the implementation.

Violation of these rules is considered a violation of the project requirements.