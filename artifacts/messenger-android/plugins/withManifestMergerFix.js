/**
 * Config plugin: fix Android manifest merger conflict for default_notification_color.
 *
 * ── Problem ──────────────────────────────────────────────────────────────────
 * expo-notifications declares:
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/notification_icon_color"/>
 * in the APP manifest.
 *
 * @react-native-firebase/messaging also declares:
 *   android:resource="@color/white"
 * in its LIBRARY manifest. The Android manifest merger rejects the duplicate
 * unless the higher-priority (app) entry carries tools:replace="android:resource".
 *
 * ── Why plugin ordering matters ───────────────────────────────────────────────
 * Expo executes config mod callbacks in LIFO order: the plugin registered LAST
 * runs FIRST. expo-notifications uses withDangerousMod to add the meta-data,
 * which means any plugin listed AFTER expo-notifications in app.json will run
 * its callbacks BEFORE expo-notifications has had a chance to insert the element.
 *
 * The fix: this plugin must be listed FIRST in the plugins[] array of app.json.
 * Being registered first → executed last (LIFO) → expo-notifications has already
 * added the meta-data → we can find and patch it.
 *
 * ── Mechanism ────────────────────────────────────────────────────────────────
 * withAndroidManifest operates on the in-memory parsed manifest JSON.
 * We find the meta-data element by android:name and add tools:replace="android:resource".
 * xmlns:tools is added to the <manifest> root if not already present.
 */

'use strict';

const { withAndroidManifest } = require('expo/config-plugins');

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withManifestMergerFix = (config) => {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Ensure xmlns:tools is declared on <manifest> so tools:replace is valid XML.
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (!application) {
      console.warn('[withManifestMergerFix] WARNING: <application> element not found in manifest');
      return modConfig;
    }

    const metaDatas = application['meta-data'] ?? [];
    let found = false;
    for (const metaData of metaDatas) {
      if (
        metaData.$?.['android:name'] ===
        'com.google.firebase.messaging.default_notification_color'
      ) {
        found = true;
        if (!metaData.$['tools:replace']) {
          metaData.$['tools:replace'] = 'android:resource';
          console.log(
            '[withManifestMergerFix] ✓ Added tools:replace="android:resource" to default_notification_color',
          );
        } else {
          console.log('[withManifestMergerFix] tools:replace already present — no change');
        }
        break;
      }
    }

    if (!found) {
      // Not necessarily an error: if expo-notifications is not configured with a
      // color, it won't add this meta-data at all, and there is nothing to merge.
      console.log(
        '[withManifestMergerFix] default_notification_color meta-data not found (expo-notifications may not have a color configured, or it was already removed)',
      );
    }

    return modConfig;
  });
};

module.exports = withManifestMergerFix;
