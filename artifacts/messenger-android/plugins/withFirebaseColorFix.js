/**
 * Expo config plugin: исправление конфликта manifest merger для Firebase.
 *
 * ── Проблема ─────────────────────────────────────────────────────────────────
 *
 * react-native-firebase_messaging объявляет в своём AndroidManifest.xml:
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/white" />
 *
 * expo-notifications добавляет тот же ключ в app-level манифест:
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/notification_icon_color" />
 *
 * Android Gradle Manifest Merger отказывается мёржить два значения одного
 * атрибута без `tools:replace="android:resource"` на записи высшего приоритета.
 *
 * ── Почему withAndroidManifest не подходил ───────────────────────────────────
 *
 * expo-notifications добавляет эту запись через СВОЙ withAndroidManifest,
 * который может выполняться ПОСЛЕ нашего плагина. withAndroidManifest-моды
 * конкурируют за порядок, и мы не можем гарантировать, что наш запустится
 * последним.
 *
 * ── Решение: withDangerousMod ────────────────────────────────────────────────
 *
 * Dangerous-моды запускаются ПОСЛЕ того, как все withAndroidManifest-моды
 * уже применены и файлы записаны на диск. Мы читаем готовый
 * AndroidManifest.xml и добавляем tools:replace напрямую в файл.
 * Это гарантированно работает независимо от порядка остальных плагинов.
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withFirebaseColorFix(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const manifestPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/AndroidManifest.xml',
      );

      if (!fs.existsSync(manifestPath)) {
        // Файл ещё не создан на этом этапе — ничего не делаем.
        console.warn('[withFirebaseColorFix] AndroidManifest.xml не найден, пропускаем.');
        return modConfig;
      }

      let xml = fs.readFileSync(manifestPath, 'utf8');

      // Убеждаемся, что xmlns:tools объявлен на <manifest>.
      if (!xml.includes('xmlns:tools=')) {
        xml = xml.replace(
          /(<manifest\b[^>]*?)>/,
          '$1 xmlns:tools="http://schemas.android.com/tools">',
        );
        console.log('[withFirebaseColorFix] добавлен xmlns:tools на <manifest>');
      }

      const before = xml;

      // Добавляем tools:replace к meta-data default_notification_color.
      // Regex не зависит от порядка атрибутов.
      xml = xml.replace(
        /(<meta-data\b(?=[^>]*android:name="com\.google\.firebase\.messaging\.default_notification_color")[^>]*?)(\/?>)/g,
        (match, attrs, close) => {
          if (attrs.includes('tools:replace')) return match; // уже есть
          return `${attrs} tools:replace="android:resource"${close}`;
        },
      );

      if (xml === before) {
        console.warn(
          '[withFirebaseColorFix] meta-data default_notification_color не найден в манифесте.' +
          ' Возможно, expo-notifications не добавил его. Конфликт может возникнуть при сборке.',
        );
      } else {
        console.log(
          '[withFirebaseColorFix] ✓ добавлен tools:replace="android:resource"',
        );
        fs.writeFileSync(manifestPath, xml, 'utf8');
      }

      return modConfig;
    },
  ]);
};
