/**
 * In-App Updater — проверка и установка обновлений с собственного сервера.
 *
 * Сервер (nginx на VPS) раздаёт:
 *   GET {server_url}/updates/version.json  — метаданные последней версии
 *   GET {server_url}/updates/messenger.apk — сам APK
 *
 * Логика:
 *  - checkForUpdate() — при холодном запуске, не чаще 1 раза в 24 ч
 *    (troттлинг через AsyncStorage). С force=true — без лимита (ручная проверка).
 *  - downloadAndInstall() — скачивает APK в кэш и открывает системный
 *    установщик (требует разрешение REQUEST_INSTALL_PACKAGES из app.json).
 *
 * Graceful degradation: любая ошибка (нет сети, нет version.json) — молча
 * возвращаем null, приложение работает как раньше.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const LAST_CHECK_KEY = 'update_last_check';
/** Сохраняет versionCode последнего успешно запущенного установщика APK. */
const INSTALLED_VERSION_KEY = 'update_installed_versioncode';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 часа

export interface UpdateInfo {
  versionCode: number;
  versionName: string;
  releasedAt: string;   // ISO-дата сборки
  changelog?: string;
  apkUrl: string;       // абсолютный URL или имя файла относительно /updates/
}

/**
 * Текущий versionCode — читается из Android Package Manager через expo-application.
 * Application.nativeBuildVersion возвращает реальный versionCode установленного APK
 * (строка на Android), а не значение, зашитое в JS-бандл при сборке.
 * Фоллбэк на Constants.expoConfig нужен только для dev/Expo Go окружения.
 */
export function getCurrentVersionCode(): number {
  // nativeBuildVersion = versionCode (Android) или buildNumber (iOS), строка
  const fromNative = Application.nativeBuildVersion;
  if (fromNative) {
    const parsed = parseInt(fromNative, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Constants.expoConfig?.android?.versionCode ?? 1;
}

/** Текущая версия приложения, например "1.1.0". */
export function getCurrentVersionName(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?';
}

/** Дата сборки, вшитая в app.config.js (extra.buildDate), или null в dev. */
export function getBuildDate(): string | null {
  const extra = Constants.expoConfig?.extra as { buildDate?: string } | undefined;
  return extra?.buildDate ?? null;
}

async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem('server_url');
}

/** Абсолютный URL APK: если в version.json указан относительный путь — дополняем. */
function resolveApkUrl(serverUrl: string, apkUrl: string): string {
  if (apkUrl.startsWith('http://') || apkUrl.startsWith('https://')) return apkUrl;
  return `${serverUrl.replace(/\/$/, '')}/updates/${apkUrl.replace(/^\//, '')}`;
}

/**
 * Проверить наличие обновления.
 *
 * Поведение по режимам:
 *  - Тихий режим (force=false, холодный запуск): не чаще 1 раза в 24 ч.
 *    Timestamp обновляется и при неудачной попытке — офлайн-запуски тоже
 *    троттлятся, приложение не долбит недоступный сервер каждый старт.
 *    Любая ошибка → null (graceful).
 *  - Ручной режим (force=true, кнопка «Проверить обновления»): без лимита,
 *    ошибки сети/сервера ПРОБРАСЫВАЮТСЯ — UI должен показать их пользователю,
 *    а не «У вас последняя версия».
 *
 * @returns UpdateInfo если доступна более новая версия; null если версия актуальна
 * @throws в ручном режиме — при недоступности сервера или битом version.json
 */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;

  if (!force) {
    const last = await AsyncStorage.getItem(LAST_CHECK_KEY).catch(() => null);
    if (last && Date.now() - Number(last) < CHECK_INTERVAL_MS) return null;
  }

  try {
    const serverUrl = await getServerUrl();
    if (!serverUrl) {
      if (force) throw new Error('URL сервера не настроен');
      return null;
    }

    const res = await fetch(`${serverUrl.replace(/\/$/, '')}/updates/version.json`, {
      headers: { 'Cache-Control': 'no-store' },
    });

    if (!res.ok) {
      // 404 — обновления ещё не выкладывались; для тихого режима это норма
      if (force) throw new Error(`Сервер обновлений недоступен (HTTP ${res.status})`);
      return null;
    }

    const info = (await res.json()) as Partial<UpdateInfo>;
    if (
      typeof info.versionCode !== 'number' ||
      typeof info.versionName !== 'string' ||
      typeof info.apkUrl !== 'string'
    ) {
      console.warn('[Update] version.json имеет неожиданный формат');
      if (force) throw new Error('Файл version.json имеет неожиданный формат');
      return null;
    }

    // Эффективная текущая версия = max(нативный versionCode, последний установленный через updater).
    // Это защищает от ситуации, когда Application.nativeBuildVersion не успел обновиться
    // после установки APK или когда versionCode в APK не совпадает с тем, что ожидал updater.
    const nativeCode = getCurrentVersionCode();
    const storedInstalled = await AsyncStorage.getItem(INSTALLED_VERSION_KEY).catch(() => null);
    const installedCode = storedInstalled ? (parseInt(storedInstalled, 10) || 0) : 0;
    const effectiveCode = Math.max(nativeCode, installedCode);

    if (info.versionCode <= effectiveCode) return null;

    return {
      versionCode: info.versionCode,
      versionName: info.versionName,
      releasedAt: info.releasedAt ?? '',
      changelog: info.changelog,
      apkUrl: resolveApkUrl(serverUrl, info.apkUrl),
    };
  } catch (err) {
    if (force) throw err instanceof Error ? err : new Error('Не удалось проверить обновления');
    // Тихий режим: нет сети / сервер недоступен — молча пропускаем
    console.warn('[Update] Проверка пропущена:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    // Троттлим и неудачные попытки — иначе офлайн-запуски проверяют каждый раз
    await AsyncStorage.setItem(LAST_CHECK_KEY, String(Date.now())).catch(() => {});
  }
}

/**
 * Скачать APK и открыть системный установщик Android.
 * @param info результат checkForUpdate
 * @param onProgress 0..1 — прогресс скачивания
 * @throws при ошибке скачивания/запуска установщика (показать пользователю)
 */
export async function downloadAndInstall(
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Обновление доступно только на Android');

  const target = `${FileSystem.cacheDirectory}update-${info.versionCode}.apk`;

  const download = FileSystem.createDownloadResumable(
    info.apkUrl,
    target,
    {},
    (p) => {
      if (onProgress && p.totalBytesExpectedToWrite > 0) {
        onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    },
  );

  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Не удалось скачать APK (HTTP ${result?.status ?? '—'})`);
  }

  // content:// URI обязателен на Android 7+ (FileProvider)
  const contentUri = await FileSystem.getContentUriAsync(result.uri);

  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: contentUri,
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });

  // Запоминаем versionCode, который был передан установщику.
  // После перезапуска приложения checkForUpdate() использует это значение
  // как «эффективную текущую версию» — даже если Application.nativeBuildVersion
  // ещё не успел обновиться.
  await AsyncStorage.setItem(INSTALLED_VERSION_KEY, String(info.versionCode)).catch(() => {});

  // Сбрасываем throttle: следующий холодный старт должен сразу перепроверить,
  // чтобы убедиться, что установленная версия актуальна.
  await AsyncStorage.removeItem(LAST_CHECK_KEY).catch(() => {});
}
