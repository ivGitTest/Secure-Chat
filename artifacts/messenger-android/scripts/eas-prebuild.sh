#!/usr/bin/env bash
# EAS prebuild wrapper.
# Запускается вместо стандартного `expo prebuild` через eas.json → prebuildCommand.
# После генерации android/ патчит AndroidManifest.xml для исправления
# конфликта Manifest Merger с react-native-firebase_messaging.
set -euo pipefail

echo "==> expo prebuild"
expo prebuild --platform android --no-install

echo "==> fix AndroidManifest.xml (tools:replace for Firebase color)"
node scripts/fix-android-manifest.js
