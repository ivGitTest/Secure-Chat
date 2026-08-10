---
name: Android build channels
description: The project supports separate EAS Cloud and GitHub Actions Android build paths.
---

EAS Cloud and GitHub Actions are intentionally independent Android build channels. EAS Cloud uses the Expo production profile and returns an installable APK without requiring Java in the Replit shell; GitHub Actions continues to use its own Java/Android SDK setup and local Gradle signing flow.

**Why:** The mobile app needs a convenient Replit Shell build while the existing GitHub workflow must remain stable for CI and release automation.

**How to apply:** Keep EAS profile/output changes separate from `.github/workflows/build-android.yml`. Firebase config must support both EAS secret-file delivery and GitHub's JSON-content secret.