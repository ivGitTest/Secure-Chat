# API Specification
# Messenger MVP

Version: 1.0

Status: Approved

Purpose: Define the REST API, WebSocket protocol, and WebRTC signaling interfaces for the Messenger MVP.

---

# 1. API Overview

The backend exposes three communication interfaces:

| Interface | Purpose |
|-----------|----------|
| REST API | Authentication, configuration, history synchronization |
| WebSocket | Real-time messaging |
| WebRTC Signaling | Voice call negotiation |

REST API must **never** be used for real-time messaging.

---

# 2. Authentication

Authentication method:

- UserID
- 6-digit PIN
- DeviceID

PIN is verified on the server using Argon2id.

After successful authentication the server returns a session token.

---

# 3. Authentication Flow

```
Client

↓

POST /api/v1/auth/login

↓

Verify PIN

↓

Register/Update DeviceID

↓

Create Session

↓

Return Access Token

↓

Connect WebSocket

↓

Synchronize History
```

---

# 4. REST API

Base URL

```
https://chat.naviry.xyz/api/v1
```

Content Type

```
application/json
```

Authentication

```
Authorization: Bearer <access_token>
```

---

# 5. Authentication Endpoints

## Login

### Request

```
POST /auth/login
```

Request Body

```json
{
  "userId": "ivan",
  "pin": "123456",
  "deviceId": "android-device-id"
}
```

Response

```json
{
  "accessToken": "...",
  "expiresIn": 86400,
  "user": {
    "id": "...",
    "name": "Ivan"
  }
}
```

Errors

| Code | Description |
|------|-------------|
|401|Invalid PIN|
|403|Account blocked|
|404|User not found|

---

## Logout

```
POST /auth/logout
```

Invalidates the current session.

Response

```
204 No Content
```

---

# 6. User Endpoints

## Get Current User

```
GET /users/me
```

Response

```json
{
  "id": "...",
  "name": "...",
  "deviceId": "..."
}
```

---

## Get Contacts

```
GET /users
```

Returns all available users.

Phone contacts are never synchronized.

---

# 7. Conversation Endpoints

## List Conversations

```
GET /conversations
```

Response

```json
[
  {
    "id": "...",
    "participantId": "...",
    "lastMessage": "...",
    "lastMessageTime": "..."
  }
]
```

---

## Get Messages

```
GET /conversations/{conversationId}/messages
```

Query Parameters

```
limit
before
```

Response

```json
[
  {
    "id": "...",
    "senderId": "...",
    "text": "...",
    "createdAt": "..."
  }
]
```

---

# 8. Configuration Endpoints

## Application Configuration

```
GET /config
```

Returns:

- server version
- supported protocol version
- WebSocket URL
- STUN servers
- TURN servers

Example

```json
{
  "version":"1.0",
  "websocketUrl":"wss://chat.naviry.xyz/ws",
  "stunServers":[
      "stun:stun.l.google.com:19302"
  ],
  "turnServers":[]
}
```

---

# 9. Health Check

```
GET /health
```

Response

```json
{
  "status":"ok"
}
```

---

# 10. WebSocket

URL

```
wss://chat.naviry.xyz/ws
```

Authentication

Bearer token during connection establishment.

One WebSocket connection per authenticated client.

---

# 11. WebSocket Message Format

Every message uses the following envelope.

```json
{
  "type":"...",
  "payload":{},
  "timestamp":"..."
}
```

---

# 12. WebSocket Events

## Client → Server

### Send Message

```json
{
  "type":"message.send",
  "payload":{
      "conversationId":"...",
      "text":"Hello"
  }
}
```

---

### Acknowledge Message

```json
{
  "type":"message.ack",
  "payload":{
      "messageId":"..."
  }
}
```

---

### Ping

```json
{
  "type":"ping"
}
```

---

# 13. Server → Client Events

## New Message

```json
{
  "type":"message.new",
  "payload":{
      "id":"...",
      "conversationId":"...",
      "senderId":"...",
      "text":"Hello",
      "createdAt":"..."
  }
}
```

---

## Delivery Confirmation

```json
{
  "type":"message.delivered",
  "payload":{
      "messageId":"..."
  }
}
```

---

## Error

```json
{
  "type":"error",
  "payload":{
      "code":"...",
      "message":"..."
  }
}
```

---

## Pong

```json
{
  "type":"pong"
}
```

---

# 14. WebSocket Error Codes

| Code | Description |
|------|-------------|
|UNAUTHORIZED|Authentication failed|
|INVALID_MESSAGE|Malformed request|
|NOT_FOUND|Resource not found|
|INTERNAL_ERROR|Unexpected server error|

---

# 15. Voice Call Signaling

Voice transport:

WebRTC

Signaling transport:

WebSocket

---

## Outgoing Call

```json
{
  "type":"call.invite",
  "payload":{
      "calleeId":"..."
  }
}
```

---

## Incoming Call

```json
{
  "type":"call.incoming",
  "payload":{
      "callerId":"..."
  }
}
```

---

## Accept Call

```json
{
  "type":"call.accept",
  "payload":{}
}
```

---

## Reject Call

```json
{
  "type":"call.reject",
  "payload":{}
}
```

---

## End Call

```json
{
  "type":"call.end",
  "payload":{}
}
```

---

# 16. WebRTC Signaling Messages

The server relays signaling messages without modification.

Supported message types:

## SDP Offer

```json
{
  "type":"webrtc.offer",
  "payload":{
      "sdp":"..."
  }
}
```

---

## SDP Answer

```json
{
  "type":"webrtc.answer",
  "payload":{
      "sdp":"..."
  }
}
```

---

## ICE Candidate

```json
{
  "type":"webrtc.iceCandidate",
  "payload":{
      "candidate":"..."
  }
}
```

---

# 17. Call Lifecycle

```
Invite

↓

Accept

↓

Offer

↓

Answer

↓

ICE Exchange

↓

Connected

↓

Call Active

↓

End
```

---

# 18. Error Responses

Standard REST error format.

```json
{
  "error":{
      "code":"INVALID_PIN",
      "message":"Invalid PIN."
  }
}
```

---

# 19. HTTP Status Codes

| Status | Meaning |
|---------|---------|
|200|Success|
|201|Created|
|204|No Content|
|400|Bad Request|
|401|Unauthorized|
|403|Forbidden|
|404|Not Found|
|409|Conflict|
|429|Too Many Requests|
|500|Internal Server Error|

---

# 20. Rate Limiting

The API should protect against abuse.

Recommended limits:

Login

```
5 requests/minute/IP
```

Authenticated REST

```
120 requests/minute/user
```

WebSocket

```
Maximum one active connection per user.
```

---

# 21. Versioning

All endpoints use URI versioning.

```
/api/v1
```

Future incompatible changes require:

```
/api/v2
```

---

# 22. Compatibility Rules

The REST API is responsible only for:

- authentication
- configuration
- history synchronization
- health checks

The WebSocket protocol is responsible only for:

- real-time messaging
- call signaling
- server events

Voice media never passes through the REST API.

---

# 23. Future Extensions

The API structure is designed to support future additions without breaking existing clients.

Reserved future capabilities include:

- Photo attachments
- Document attachments
- Message editing
- Message deletion
- Replies
- Forwarding
- Push notifications
- Group voice calls

These features are intentionally excluded from the MVP but their future introduction should not require redesign of the existing API.