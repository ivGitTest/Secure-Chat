// app.config.js — единственный источник Expo-конфига.
// app.json удалён; этот файл содержит весь конфиг целиком.
//
// Версия и номер сборки берутся из release.json.
// GOOGLE_SERVICES_JSON  — env-переменная (GitHub Actions secret / EAS secret):
//   задайте её один раз командой:
//     eas secret:create --scope project --name GOOGLE_SERVICES_JSON \
//       --type string --value "$(cat google-services.json)"

const fs   = require('fs');
const path = require('path');

const release = require('./release.json');

// ── Записать google-services.json из env-переменной ──────────────────────────
// Это нужно для EAS Cloud и GitHub Actions, где файл не коммитится в репо.
const googleServicesPath = path.join(__dirname, 'google-services.json');
if (process.env.GOOGLE_SERVICES_JSON) {
  try {
    // Может прийти как JSON-строка или как однострочный JSON
    const content = JSON.parse(process.env.GOOGLE_SERVICES_JSON);
    fs.writeFileSync(googleServicesPath, JSON.stringify(content, null, 2));
  } catch {
    // Если уже валидный JSON-файл в виде строки — пишем как есть
    fs.writeFileSync(googleServicesPath, process.env.GOOGLE_SERVICES_JSON);
  }
}

module.exports = {
  expo: {
    name:               'Семейный мессенджер',
    slug:               'messenger-android',
    version:            release.version,
    orientation:        'portrait',
    icon:               './assets/images/icon.png',
    scheme:             'messenger-android',
    userInterfaceStyle: 'light',
    newArchEnabled:     false,

    splash: {
      image:           './assets/images/icon.png',
      resizeMode:      'contain',
      backgroundColor: '#ffffff',
    },

    ios: {
      supportsTablet: false,
      infoPlist: {
        NSMicrophoneUsageDescription: 'Необходим для голосовых звонков',
      },
    },

    android: {
      package:                    'com.ivaexpi.messengerandroid',
      versionCode:                release.versionCode,
      softwareKeyboardLayoutMode: 'resize',
      // Путь к файлу — требуется плагином @react-native-firebase/app.
      // Файл создаётся выше из env-переменной GOOGLE_SERVICES_JSON.
      googleServicesFile:         './google-services.json',
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.VIBRATE',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.REQUEST_INSTALL_PACKAGES',
        'android.permission.CALL_PHONE',
        'android.permission.MANAGE_OWN_CALLS',
        'android.permission.READ_PHONE_STATE',
        'android.permission.READ_PHONE_NUMBERS',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      ],
    },

    web: {
      favicon: './assets/images/icon.png',
    },

    plugins: [
      ['expo-router', { origin: 'https://replit.com/' }],
      'expo-font',
      'expo-web-browser',
      ['expo-notifications', {
        icon:        './assets/images/icon.png',
        color:       '#4CAF50',
        androidMode: 'default',
      }],
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      './plugins/withCallKeep',
      './plugins/withFirebaseCallService',
      './plugins/withMicrophoneCallService',
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      eas: {
        projectId: '31cfd34c-5e09-47a2-8e45-8fab241f3c71',
      },
    },
  },
};
