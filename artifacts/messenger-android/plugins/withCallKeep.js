/**
 * Expo config plugin for react-native-callkeep (Android).
 *
 * Adds everything AndroidManifest.xml needs for react-native-callkeep to
 * function as a Telecom ConnectionService:
 *
 *  1. <uses-feature> for telephony and the telecom framework — required for
 *     Android to surface this app as a call provider and for react-native-callkeep's
 *     `isConnectionServiceAvailable()` check to return true.
 *
 *  2. `io.wazo.callkeep.VoiceConnectionService` <service> entry with
 *     - BIND_TELECOM_CONNECTION_SERVICE permission (gate for Telecom binding)
 *     - `android.telecom.ConnectionService` intent-filter (registration signal)
 *     - `android.telecom.PhoneAccount.EXTRA_CALL_SUBJECT` metadata that
 *       react-native-callkeep reads when constructing the PhoneAccountHandle
 *
 *  ⚠ First-launch requirement: the PhoneAccount is registered with Android's
 *    TelecomManager at runtime by `RNCallKeep.setup()` (called in _layout.tsx).
 *    The OS persists this registration across app kills.  Headless FCM call
 *    delivery (`addNewIncomingCall`) reads the already-registered account.
 *    The user must therefore launch the app at least once before calls can
 *    be received while the app is killed.
 *
 * This does NOT touch iOS — the app is Android-only.
 */
const { withAndroidManifest } = require('expo/config-plugins');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withCallKeep(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // ── 0. Extra permissions for reliable VoIP delivery ──────────────────────
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];

    const EXTRA_PERMISSIONS = [
      // Wakes the screen on lock for CATEGORY_CALL notifications (Android 11+).
      // Auto-granted on Android 14+ for apps with MANAGE_OWN_CALLS.
      'android.permission.USE_FULL_SCREEN_INTENT',
      // Exempts the app from Doze / battery optimisation so FCM can start
      // the process even when the app is force-killed (swiped from Recent Apps).
      // WhatsApp, Telegram, Signal all declare this for the same reason.
      // The user is shown a one-time system dialog by the JS layer (_layout.tsx).
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      // Required so that setFullScreenIntent() can wake the display from
      // Doze / deep-sleep on Android 9+. Without this the screen never turns
      // on and the incoming-call UI is never seen on a locked device.
      'android.permission.WAKE_LOCK',
    ];
    for (const perm of EXTRA_PERMISSIONS) {
      if (!manifest['uses-permission'].some((p) => p.$?.['android:name'] === perm)) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    }

    // ── 1. <uses-feature> ────────────────────────────────────────────────────
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];

    const REQUIRED_FEATURES = [
      'android.hardware.telephony',
      'android.software.telecom',
    ];
    for (const name of REQUIRED_FEATURES) {
      const alreadyPresent = manifest['uses-feature'].some(
        (f) => f.$?.['android:name'] === name,
      );
      if (!alreadyPresent) {
        manifest['uses-feature'].push({
          $: {
            'android:name': name,
            'android:required': 'false', // optional — device may lack telephony hardware
          },
        });
      }
    }

    // ── 2. VoiceConnectionService declaration ────────────────────────────────
    const application = manifest.application?.[0];
    if (!application) return modConfig;

    if (!application.service) application.service = [];

    const SERVICE_NAME = 'io.wazo.callkeep.VoiceConnectionService';
    const alreadyDeclared = application.service.some(
      (s) => s.$?.['android:name'] === SERVICE_NAME,
    );

    if (!alreadyDeclared) {
      application.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
          // foregroundServiceType intentionally omitted: foregroundService config is
          // not passed to RNCallKeep.setup() (see callkeepService.ts) to prevent
          // a NullPointerException in the killed-app call path.
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.telecom.ConnectionService' } },
            ],
          },
        ],
        // Phone-account metadata that Android's Telecom framework reads when
        // constructing the PhoneAccount for this ConnectionService.
        // Required by react-native-callkeep for TelecomManager.addNewIncomingCall
        // to accept the call and show the system incoming-call screen.
        'meta-data': [
          {
            $: {
              'android:name': 'android.telecom.PHONE_ACCOUNT_HANDLE_ID',
              'android:value': '@string/app_name',
            },
          },
        ],
      });
    }

    return modConfig;
  });
};
