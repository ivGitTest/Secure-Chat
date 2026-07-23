#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Generate Android keystore for CI builds — run ONCE, then add to GitHub Secrets
#
# Usage:
#   chmod +x scripts/gen-keystore.sh
#   ./scripts/gen-keystore.sh
#
# After running, copy the printed values into GitHub Settings → Secrets:
#   ANDROID_KEYSTORE_BASE64    — base64 of the .jks file
#   ANDROID_KEYSTORE_PASSWORD  — password you chose
#   ANDROID_KEY_ALIAS          — alias (default: upload)
#   ANDROID_KEY_PASSWORD       — key password you chose
#
# Keep keystore.jks safe — losing it means you can't update the app
# on devices that have a previous version installed (signature mismatch).
# ─────────────────────────────────────────────────────────────────────────────

set -e

OUT="artifacts/messenger-android/keystore.jks"
ALIAS="upload"
PASS="$(openssl rand -hex 16)"   # random 32-char password
CN="Family Messenger"

echo ""
echo "Generating keystore..."
keytool -genkeypair -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -storepass "$PASS" \
  -keypass "$PASS" \
  -dname "CN=$CN, OU=Dev, O=Family, L=Unknown, ST=Unknown, C=RU" \
  2>&1 | tail -3

echo ""
echo "┌─ Add these to GitHub Settings → Secrets → Actions ─────────────────────"
echo "│"
echo "│  ANDROID_KEYSTORE_BASE64:"
echo "│  $(base64 -w 0 "$OUT")"
echo "│"
echo "│  ANDROID_KEYSTORE_PASSWORD:  $PASS"
echo "│  ANDROID_KEY_ALIAS:          $ALIAS"
echo "│  ANDROID_KEY_PASSWORD:       $PASS"
echo "│"
echo "└────────────────────────────────────────────────────────────────────────"
echo ""
echo "⚠  Store the keystore file and password in a safe place (password manager)."
echo "   File: $OUT  (already in .gitignore)"
