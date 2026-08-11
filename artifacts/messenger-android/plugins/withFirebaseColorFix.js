/**
 * Expo config plugin: исправление конфликта manifest merger для Firebase.
 *
 * ── Проблема ─────────────────────────────────────────────────────────────────
 *
 * react-native-firebase_messaging объявляет в своём AndroidManifest.xml:
 *
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/white" />
 *
 * Наш AndroidManifest.xml объявляет тот же ключ с другим значением:
 *
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/notification_icon_color" />
 *
 * Android Gradle Manifest Merger отказывается мёржить два значения одного
 * атрибута без явного указания приоритета.  Решение — добавить на
 * запись высшего приоритета (нашей) атрибут `tools:replace="android:resource"`,
 * который сообщает мёрджеру: «использовать наше значение, игнорировать чужое».
 *
 * ── Почему это делается в plugin, а не в Python-патче ────────────────────────
 *
 * GitHub Actions запускал патч вручную уже после `expo prebuild`.  EAS Cloud
 * запускает только `expo prebuild` + Gradle — пост-prebuild патч там не
 * выполняется.  Config plugin работает внутри `expo prebuild` и применяется
 * одинаково в обоих режимах сборки.
 */

const { withAndroidManifest } = require('expo/config-plugins');

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withFirebaseColorFix(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Убедиться, что xmlns:tools объявлен на корневом элементе <manifest>.
    // Без этого атрибут tools:replace не будет распознан XML-парсером.
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (!application) return modConfig;

    const metaDataList = application['meta-data'] ?? [];
    const colorEntry = metaDataList.find(
      (m) =>
        m.$?.['android:name'] ===
        'com.google.firebase.messaging.default_notification_color',
    );

    if (colorEntry) {
      // Наша запись получает приоритет над @color/white из firebase_messaging.
      colorEntry.$['tools:replace'] = 'android:resource';
      // eslint-disable-next-line no-console
      console.log(
        '[withFirebaseColorFix] added tools:replace to default_notification_color',
      );
    } else {
      console.warn(
        '[withFirebaseColorFix] meta-data for default_notification_color not found — ' +
        'run this plugin AFTER @react-native-firebase/app',
      );
    }

    return modConfig;
  });
};
