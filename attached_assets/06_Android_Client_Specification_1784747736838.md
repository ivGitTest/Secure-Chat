# Android Client Specification
# Messenger MVP

Version: 1.0

Status: Approved

Purpose: Defines the functional and technical requirements for the Android client of Messenger MVP.

---

# 1. Purpose

The Android application is the only client for the MVP.

The client must provide:

- user authentication;
- text messaging;
- voice calls;
- automatic history synchronization.

The application is intended only for family use.

User interface quality is **not** a priority for MVP.

Priority is:

1. Stability
2. Simplicity
3. Correctness
4. Maintainability

---

# 2. Technology Stack

The client MUST use:

- React Native
- Expo
- TypeScript
- Expo Router
- React Navigation (if required)
- React Native WebRTC
- Expo Secure Store

APK will be built using Replit + Expo.

No native Android development is required.

---

# 3. Design Principles

The application must use the simplest possible user interface.

Use standard Expo / React Native components whenever possible.

Avoid:

- custom animations;
- custom controls;
- complex layouts;
- visual effects.

Material You compliance is not required.

---

# 4. Theme

Support only:

- Light Theme

Dark Theme is not required.

---

# 5. Localization

Only one language is required:

Russian.

No localization framework is required.

---

# 6. Application Flow

Application startup:

```
Splash

↓

Authentication

↓

Chat List

↓

Chat

↓

Incoming Call

↓

Active Call
```

---

# 7. Screens

The MVP contains only six screens.

## Splash Screen

Purpose:

- initialize application;
- verify saved session;
- connect to backend.

Possible results:

- authorized → Chat List;
- unauthorized → Login.

---

## Login Screen

Contains:

- UserID
- PIN
- Login button

Validation:

- UserID required
- PIN exactly six digits

No registration.

No password recovery.

---

## Chat List

Displays:

- available users;
- last message;
- message timestamp.

Selecting a user opens the chat.

No search.

No sorting options.

No filters.

---

## Chat Screen

Contains:

- message history;
- message input;
- Send button;
- Voice Call button.

No:

- images;
- attachments;
- emoji picker;
- reactions;
- editing;
- deleting;
- forwarding.

---

## Incoming Call

Displays:

- caller name;
- Accept button;
- Reject button.

---

## Active Call

Displays:

- participant name;
- call duration;
- Mute button;
- Hang Up button.

No speaker selection.

No Bluetooth controls.

No video.

---

# 8. Navigation

Simple stack navigation only.

Deep links are not required.

Bottom tabs are not required.

Drawer menu is not required.

---

# 9. Authentication

Authentication requires:

- UserID
- PIN
- DeviceID

After successful login:

- token stored in Expo Secure Store;
- automatic login on next launch.

Logout removes:

- access token;
- local session.

---

# 10. Local Storage

Only the following data may be stored locally:

- access token;
- user information;
- application settings.

Messages are synchronized from the server.

The client is not responsible for permanent message storage.

---

# 11. Networking

REST API:

- authentication;
- synchronization;
- configuration.

WebSocket:

- messaging;
- signaling.

WebRTC:

- voice media.

---

# 12. Connection Recovery

The client must automatically:

- reconnect WebSocket;
- restore session;
- reload message history if necessary.

User intervention should not be required.

---

# 13. Permissions

Only required permissions may be requested.

Required:

- Microphone
- Internet
- Network State

Camera permission is prohibited.

Storage permission is prohibited.

Contacts permission is prohibited.

Location permission is prohibited.

Notification permission is not required for MVP.

---

# 14. Error Handling

Display simple messages using standard dialogs or alerts.

Examples:

- Invalid PIN
- Connection lost
- Server unavailable
- Call failed

No custom error screens.

---

# 15. Loading Indicators

Use the standard Expo ActivityIndicator.

No custom loaders.

---

# 16. Icons

Use only built-in Expo vector icons.

No custom icon packs.

---

# 17. Fonts

Use only system fonts.

No downloadable fonts.

No custom typography.

---

# 18. Images

The application should contain only:

- application icon;
- splash image.

No avatars.

No profile pictures.

No image caching.

---

# 19. Performance

The application should remain responsive on Android 10+ devices.

No additional optimization is required unless performance issues are identified.

---

# 20. Security

PIN must never be stored locally.

Access Token must be stored only in Expo Secure Store.

All communication must use HTTPS or WSS.

No secrets may be embedded in the application.

---

# 21. Code Organization

Suggested structure:

```
app/
components/
services/
hooks/
screens/
navigation/
api/
types/
utils/
assets/
```

Avoid unnecessary abstraction.

Avoid premature optimization.

---

# 22. Dependencies

Only add libraries when absolutely necessary.

Prefer Expo SDK functionality whenever available.

Avoid duplicate libraries.

---

# 23. Logging

Development logging is allowed.

Production logging should be minimal.

Never log:

- PIN;
- Access Token;
- Session Token;
- DeviceID.

---

# 24. MVP Completion Criteria

The Android client is considered complete when:

✓ User authentication works.

✓ Session is restored automatically.

✓ Chat list loads successfully.

✓ Messages can be sent and received.

✓ Message history is synchronized.

✓ Voice calls work.

✓ Incoming calls are handled.

✓ WebSocket reconnects automatically.

✓ APK builds successfully using Replit + Expo.

No additional features are required for MVP.