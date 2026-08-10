#!/bin/bash
# EAS Cloud pre-build script.
# Called via eas.json prebuildCommand: "bash scripts/prebuild-eas.sh"
#
# Why a script instead of "expo prebuild && node ...":
#   EAS rewrites "npx expo ..." to "pnpm expo ...", which passes all tokens
#   (including "&&") as CLI arguments to expo-cli rather than to the shell.
#   This causes expo prebuild to interpret "&&" as the project root path and
#   exit with "Invalid project root: .../&&".
#   A separate script avoids the issue entirely.
set -euo pipefail

echo "[prebuild-eas] Running expo prebuild..."
npx expo prebuild --platform android

echo "[prebuild-eas] Applying AndroidManifest.xml patch..."
node scripts/fix-android-manifest.js

echo "[prebuild-eas] Done."
