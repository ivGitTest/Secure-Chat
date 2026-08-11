#!/usr/bin/env node
/**
 * Post-prebuild manifest patch: добавляет tools:replace="android:resource"
 * на meta-data default_notification_color в AndroidManifest.xml.
 *
 * Запускается из prebuildCommand в eas.json ПОСЛЕ expo prebuild --clean,
 * когда манифест уже окончательно сгенерирован всеми плагинами.
 *
 * Почему это нужно:
 *   react-native-firebase_messaging поставляет свой AndroidManifest с записью
 *   default_notification_color=@color/white. Наш app-level манифест объявляет
 *   тот же ключ со значением @color/notification_icon_color. Gradle Manifest
 *   Merger отвергает два значения одного атрибута без явного tools:replace на
 *   записи с высшим приоритетом (нашей).
 */

const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(
  __dirname,
  '../android/app/src/main/AndroidManifest.xml',
);

if (!fs.existsSync(manifestPath)) {
  console.error(`✗ AndroidManifest.xml не найден: ${manifestPath}`);
  console.error('  Запустите скрипт после expo prebuild.');
  process.exit(1);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

// Проверяем: уже исправлен?
if (xml.includes('tools:replace="android:resource"') &&
    xml.includes('com.google.firebase.messaging.default_notification_color')) {
  console.log('✓ tools:replace уже присутствует — ничего не меняем.');
  process.exit(0);
}

// Убеждаемся, что xmlns:tools объявлен на <manifest ...>
if (!xml.includes('xmlns:tools=')) {
  xml = xml.replace(
    /(<manifest\b[^>]*?)>/,
    '$1 xmlns:tools="http://schemas.android.com/tools">',
  );
  console.log('  + добавлен xmlns:tools на <manifest>');
}

// Ищем meta-data с default_notification_color и добавляем tools:replace.
// Атрибуты могут идти в любом порядке — используем regex без строгой
// фиксации позиции.
const before = xml;
xml = xml.replace(
  /(<meta-data\b(?=[^>]*android:name="com\.google\.firebase\.messaging\.default_notification_color")[^>]*?)(\/?>)/g,
  (match, attrs, close) => {
    if (attrs.includes('tools:replace')) return match; // уже есть
    return `${attrs} tools:replace="android:resource"${close}`;
  },
);

if (xml === before) {
  // Ничего не заменили — выводим строки с notification_color для диагностики
  console.error('✗ Не удалось найти meta-data для default_notification_color.');
  console.error('  Текущие строки с notification_color:');
  xml.split('\n').forEach((line, i) => {
    if (line.includes('notification_color')) {
      console.error(`  строка ${i + 1}: ${line.trim()}`);
    }
  });
  process.exit(1);
}

fs.writeFileSync(manifestPath, xml, 'utf8');
console.log('✓ tools:replace="android:resource" добавлен на default_notification_color');
