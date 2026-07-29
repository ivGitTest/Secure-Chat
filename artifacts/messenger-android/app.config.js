const fs = require('fs');
const path = require('path');

// When running inside the EAS local build sandbox, the GOOGLE_SERVICES_JSON
// env var carries the Firebase config (injected by GitHub Actions).
// We write it to disk here — during Expo config evaluation — so that
// @expo/config-plugins can copy it into android/app/ during prebuild.
// This runs AFTER the project archive is extracted, which is why committing
// the file to git and relying on git-archive never worked.
const googleServicesJson = process.env.GOOGLE_SERVICES_JSON;
if (googleServicesJson && googleServicesJson.trim().startsWith('{')) {
  const dest = path.join(__dirname, 'google-services.json');
  fs.writeFileSync(dest, googleServicesJson);
  console.log('[app.config.js] Wrote google-services.json from GOOGLE_SERVICES_JSON env var');
}

const hasGoogleServices = fs.existsSync(path.join(__dirname, 'google-services.json'));

/** @type {import('@expo/config').ExpoConfig} */
module.exports = ({ config }) => {
  return {
    ...config,
    extra: {
      ...config.extra,
      // Дата сборки — показывается на экране «О приложении».
      // Фиксируется в момент evaluate конфига (т.е. при сборке APK).
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    },
    android: {
      ...config.android,
      // Only tell prebuild about the file when it actually exists.
      // Without this guard, a local dev build without the file would crash.
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
