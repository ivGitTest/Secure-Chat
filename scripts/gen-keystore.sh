#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Generate Android keystore for CI builds — run ONCE, then add to GitHub Secrets
# Uses OpenSSL only (no JDK/keytool required).
#
# Usage:
#   chmod +x scripts/gen-keystore.sh
#   ./scripts/gen-keystore.sh
#
# After running, copy the printed values into:
#   GitHub → Settings → Secrets → Actions
#
# ANDROID_KEYSTORE_BASE64    — base64 of the .jks file
# ANDROID_KEYSTORE_PASSWORD  — password chosen below
# ANDROID_KEY_ALIAS          — upload
# ANDROID_KEY_PASSWORD       — same password
#
# ⚠  Keep keystore.jks and the password in a safe place (password manager).
#    Losing either means you can't update the app on devices that have a
#    previous version installed (Android requires same signature for updates).
# ─────────────────────────────────────────────────────────────────────────────

set -e

OUT="artifacts/messenger-android/keystore.jks"
ALIAS="upload"
PASS="$(openssl rand -hex 16)"
CN="Family Messenger"

echo ""
echo "Generating keystore via OpenSSL..."

# 1. RSA private key (4096-bit)
openssl genrsa -out /tmp/ks_key.pem 4096 2>/dev/null

# 2. Self-signed certificate valid for ~27 years
openssl req -new -x509 \
  -key /tmp/ks_key.pem \
  -out /tmp/ks_cert.pem \
  -days 10000 \
  -subj "/CN=$CN/OU=Dev/O=Family/L=Unknown/ST=Unknown/C=RU" \
  2>/dev/null

# 3. Bundle into PKCS12 (Android accepts PKCS12 keystores directly)
openssl pkcs12 -export \
  -inkey /tmp/ks_key.pem \
  -in    /tmp/ks_cert.pem \
  -name  "$ALIAS" \
  -out   "$OUT" \
  -passout "pass:$PASS" \
  2>/dev/null

# Clean up temp files
rm -f /tmp/ks_key.pem /tmp/ks_cert.pem

echo "Done. File: $OUT"
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
echo "└─────────────────────────────────────────────────────────────────────────"
echo ""
echo "⚠  Store the password in a safe place — you'll need it if you ever"
echo "   regenerate secrets or switch CI providers."
