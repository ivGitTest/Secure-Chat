---
name: Android build channels
description: The project supports separate EAS Cloud and GitHub Actions Android build paths; signing material must stay in secret storage.
---

EAS Cloud and GitHub Actions are intentionally independent Android build channels. EAS Cloud uses the Expo production profile and returns an installable APK without requiring Java in the Replit shell; GitHub Actions uses its own Java/Android SDK setup and local Gradle signing flow.

**Signing:** Signing material must never be committed to the repository or pasted into chat. GitHub Actions should decode its keystore from GitHub Secrets at build time. EAS should use protected remote credentials or a locally supplied keystore that is injected only during the build.

**Why:** Android requires the same signing certificate across all updates to the same package, but exposing a keystore lets anyone sign a malicious update. A private repository is not an acceptable place for signing material.

**How to apply:** Keep EAS profile/output changes separate from `.github/workflows/build-android.yml`. Firebase config must support both EAS secret-file delivery and GitHub's JSON-content secret. Before changing signing keys for sideloaded APKs, account for the fact that existing installations cannot update across a key change and may require uninstall/reinstall.
