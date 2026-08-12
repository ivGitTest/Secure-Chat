/**
 * Expo config plugin: исправление конфликта manifest merger для Firebase.
 *
 * ── Проблема ─────────────────────────────────────────────────────────────────
 *
 * expo-notifications (с параметром color) добавляет в app-level манифест:
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/notification_icon_color"/>   ← без tools:replace
 *
 * react-native-firebase_messaging поставляет в своём library-манифесте:
 *   <meta-data android:name="com.google.firebase.messaging.default_notification_color"
 *              android:resource="@color/white"/>
 *
 * Gradle Manifest Merger видит два разных значения одного атрибута и падает.
 *
 * ── Решение ──────────────────────────────────────────────────────────────────
 *
 * Плагин находится в plugins[] ПОСЛЕ expo-notifications, поэтому его
 * withAndroidManifest-мод гарантированно запускается ПОСЛЕ мода expo-notifications.
 * Мы удаляем запись, добавленную expo-notifications, и вставляем новую
 * с tools:replace="android:resource" — это позволяет app-уровню победить.
 *
 * Стратегия "удалить и добавить заново" надёжнее простого патча: работает
 * независимо от формата атрибутов, добавленных expo-notifications.
 */

const { withAndroidManifest } = require('expo/config-plugins');

const FCM_COLOR_META = 'com.google.firebase.messaging.default_notification_color';

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
module.exports = function withFirebaseColorFix(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // Убеждаемся, что xmlns:tools объявлен на корневом <manifest>.
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (!application) {
      console.warn('[withFirebaseColorFix] <application> не найден в манифесте.');
      return modConfig;
    }

    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    // Находим существующую запись от expo-notifications (или другого плагина).
    const existing = application['meta-data'].find(
      (m) => m.$?.['android:name'] === FCM_COLOR_META,
    );

    if (existing) {
      // Уже добавлена tools:replace — ничего не делаем.
      if (existing.$?.['tools:replace']) {
        console.log('[withFirebaseColorFix] tools:replace уже присутствует, пропускаем.');
        return modConfig;
      }

      // Читаем текущее значение ресурса цвета (как правило @color/notification_icon_color).
      const resourceValue = existing.$?.['android:resource'] ?? '@color/notification_icon_color';

      // Удаляем старую запись (без tools:replace).
      application['meta-data'] = application['meta-data'].filter(
        (m) => m.$?.['android:name'] !== FCM_COLOR_META,
      );

      // Добавляем новую запись с tools:replace.
      application['meta-data'].push({
        $: {
          'android:name': FCM_COLOR_META,
          'android:resource': resourceValue,
          'tools:replace': 'android:resource',
        },
      });

      console.log(
        `[withFirebaseColorFix] ✓ заменил default_notification_color: ` +
        `resource=${resourceValue}, добавлен tools:replace="android:resource"`,
      );
    } else {
      // expo-notifications ещё не добавил запись (или color не задан).
      // Добавляем сами — на случай если expo-notifications запустится позже.
      application['meta-data'].push({
        $: {
          'android:name': FCM_COLOR_META,
          'android:resource': '@color/notification_icon_color',
          'tools:replace': 'android:resource',
        },
      });

      console.log(
        '[withFirebaseColorFix] ✓ добавил default_notification_color с tools:replace ' +
        '(запись expo-notifications не найдена — добавлена превентивно).',
      );
    }

    return modConfig;
  });
};
