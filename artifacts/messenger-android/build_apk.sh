#!/usr/bin/env bash
set -euo pipefail

# EAS Cloud builds the native Android project, so Java/Gradle do not need to
# be installed in the Replit shell. The production profile intentionally
# outputs an installable APK (see eas.json).
npx -y eas-cli@latest build --platform android --profile production
