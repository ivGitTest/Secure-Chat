---
name: Android build channels
description: The project supports separate EAS Cloud and GitHub Actions Android build paths; both now sign with the same keystore.
---

EAS Cloud and GitHub Actions are intentionally independent Android build channels. EAS Cloud uses the Expo production profile (`credentialsSource: "local"`) and returns an installable APK without requiring Java in the Replit shell; GitHub Actions uses its own Java/Android SDK setup and local Gradle signing flow.

**Signing:** Both channels use the same `keystore.jks` (alias `upload`). `credentials.json` tells EAS Cloud to use it via `credentialsSource: "local"` in eas.json. GitHub Actions decodes `ANDROID_KEYSTORE_BASE64` secret → `keystore.jks` at build time. Both files are committed to the private repo (intentionally — family-only project).

**Why:** Using different keystores caused "App not installed as package conflicts with an existing package" when installing an EAS-built APK over a GitHub Actions-built one. Android requires the same signing certificate across all updates to the same package.

**How to apply:** Keep EAS profile/output changes separate from `.github/workflows/build-android.yml`. Firebase config must support both EAS secret-file delivery and GitHub's JSON-content secret. Never regenerate EAS remote credentials — the project uses local credentials only.
