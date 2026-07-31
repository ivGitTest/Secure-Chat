/**
 * Expo dynamic config.
 *
 * Extends app.json with build-time injection of google-services.json.
 *
 * In CI (GitHub Actions), the GOOGLE_SERVICES_JSON secret is passed as an
 * environment variable to the EAS local build step. This file writes it to
 * disk at config-eval time so the @react-native-firebase/app Expo plugin can
 * read it and copy it to the correct location during Android prebuild.
 *
 * Locally the file already exists (google-services.json is committed to the
 * repo) and the env var is not set, so this is a no-op for local development.
 *
 * Why app.config.js instead of app.json for googleServicesFile:
 *   The @react-native-firebase/app plugin requires android.googleServicesFile
 *   to be set in the Expo config. We cannot conditionally set it in app.json,
 *   so we override it here.
 */

const fs = require('fs');
const path = require('path');

const googleServicesPath = path.join(__dirname, 'google-services.json');

// In CI: write google-services.json from the secret env var.
// GOOGLE_SERVICES_JSON contains the JSON file content (not base64).
if (process.env.GOOGLE_SERVICES_JSON) {
  fs.writeFileSync(googleServicesPath, process.env.GOOGLE_SERVICES_JSON, 'utf8');
  console.log('[app.config.js] Wrote google-services.json from GOOGLE_SERVICES_JSON env');
}

/** @type {import('@expo/config').ExpoConfig} */
const { expo } = require('./app.json');

// BUILD_DATE is injected by CI (GitHub Actions "Set build date" step) as an
// ISO-8601 string (e.g. "2026-07-30T10:15:00Z"). It is read by updateService.ts
// via Constants.expoConfig?.extra?.buildDate to display the build timestamp in
// the version screen. In local dev it is undefined and the version screen shows
// nothing for the build date, which is expected.
const buildDate = process.env.BUILD_DATE ?? null;

module.exports = {
  expo: {
    ...expo,
    android: {
      ...expo.android,
      // Required by @react-native-firebase/app plugin.
      // Points to the committed file locally; overwritten from secret in CI above.
      googleServicesFile: './google-services.json',
    },
    extra: {
      ...(expo.extra ?? {}),
      // Injected by CI; null in local dev (version screen omits the date).
      buildDate,
    },
  },
};
