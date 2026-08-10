#!/usr/bin/env node
/**
 * Post-prebuild manifest fix: add tools:replace="android:resource" to
 * the com.google.firebase.messaging.default_notification_color meta-data.
 *
 * Why this is needed:
 *   expo-notifications declares default_notification_color=@color/notification_icon_color
 *   in the app manifest. @react-native-firebase/messaging also declares
 *   default_notification_color=@color/white in its library manifest. The Android
 *   manifest merger rejects the duplicate unless the app-level entry carries
 *   tools:replace="android:resource".
 *
 * Why a standalone script instead of a config plugin:
 *   Expo's withDangerousMod runs BEFORE withAndroidManifest, so the meta-data
 *   added by expo-notifications doesn't exist yet when our plugin's dangerous mod
 *   runs. A post-prebuild script reads the fully-written manifest and is the only
 *   reliable fix. GitHub Actions applies the equivalent Python patch; this script
 *   is used by EAS Cloud via the prebuildCommand field in eas.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// When called from EAS Cloud, CWD is the artifact root (artifacts/messenger-android).
// When called from the monorepo root (e.g. for testing), adjust the path accordingly.
const manifestPath = path.resolve(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
);

if (!fs.existsSync(manifestPath)) {
  console.error(
    `[fix-android-manifest] AndroidManifest.xml not found at:\n  ${manifestPath}`,
  );
  console.error('Run expo prebuild first.');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

// ── 1. Ensure xmlns:tools is declared on the root <manifest> element ─────────
if (!xml.includes('xmlns:tools=')) {
  xml = xml.replace(
    'xmlns:android="http://schemas.android.com/apk/res/android"',
    'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"',
  );
  console.log('[fix-android-manifest] Added xmlns:tools to <manifest>');
}

// ── 2. Add tools:replace to the default_notification_color meta-data ─────────
const TARGET =
  'android:name="com.google.firebase.messaging.default_notification_color"';
const REPLACE_ATTR = 'tools:replace="android:resource"';

if (!xml.includes(TARGET)) {
  // Not present — perhaps expo-notifications config changed. Log a warning but
  // do not fail: the merger would only error if both libraries declare it.
  console.warn(
    '[fix-android-manifest] WARNING: default_notification_color meta-data not found.',
    'If the build fails with a manifest merger error, investigate this.',
  );
} else if (xml.includes(REPLACE_ATTR)) {
  console.log(
    '[fix-android-manifest] tools:replace already present — nothing to do.',
  );
} else {
  // Locate the closing /> of the matching <meta-data> element.
  // We search forward from the TARGET position to avoid false matches.
  // Using index-based slicing instead of regex because attribute values
  // contain '/' (e.g. @color/notification_icon_color), which breaks [^/]* patterns.
  const nameIdx = xml.indexOf(TARGET);
  const closeIdx = xml.indexOf('/>', nameIdx);

  if (closeIdx === -1) {
    console.error(
      '[fix-android-manifest] ERROR: Could not find closing /> for notification_color meta-data.',
    );
    process.exit(1);
  }

  xml = xml.slice(0, closeIdx) + ` ${REPLACE_ATTR}` + xml.slice(closeIdx);
  console.log(
    '[fix-android-manifest] ✓ Added tools:replace="android:resource" to default_notification_color',
  );
}

fs.writeFileSync(manifestPath, xml, 'utf8');
console.log('[fix-android-manifest] Manifest written.');
