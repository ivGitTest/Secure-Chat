/**
 * Push notification registration for the family messenger app.
 *
 * Call `registerForPushNotifications()` after the user has logged in
 * (i.e. from chat-list.tsx on mount). The function:
 *  1. Requests notification permission from the OS (shows the dialog once).
 *  2. Gets the Expo push token tied to this device.
 *  3. Sends the token to the server so it can reach this device when offline.
 *
 * Graceful degradation: if anything fails (Expo Go without google-services.json,
 * permission denied, network error) the error is logged silently and the app
 * continues without push. All real-time delivery still works via WebSocket
 * while the app is in the foreground.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '@/api/client';

/** EAS project ID — must match app.json extra.eas.projectId */
const PROJECT_ID = '31cfd34c-5e09-47a2-8e45-8fab241f3c71';

/**
 * Set up Android notification channels (idempotent — safe to call every launch).
 * Channels must exist before the first notification arrives.
 */
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Звонки',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4CAF50',
    sound: 'default',
    enableVibrate: true,
    showBadge: false,
  });
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Сообщения',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    showBadge: false,
  });
}

/**
 * Request permission, get Expo push token, and register it with the server.
 * Must be called after the user is authenticated (needs a valid JWT on the server).
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    // Set up channels first so they exist before any notification arrives
    await setupNotificationChannels();

    // Request notification permission — Android 13+ shows the dialog once.
    // On older Android it's always granted. We don't check the return value because
    // the NotificationPermissionsStatus type doesn't resolve cleanly through the
    // pnpm workspace; instead we let getExpoPushTokenAsync throw if denied.
    await Notifications.requestPermissionsAsync();

    // Throws if permission was denied, if google-services.json is missing (Expo Go),
    // or if the device has no Google Play Services. All caught below.
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    const token = tokenResult.data;

    await registerPushToken(token);
    console.log('[Push] Token registered:', token.slice(0, 32) + '…');
  } catch (err) {
    // Graceful degradation: e.g. Expo Go without google-services.json returns an error
    // "Notifications functionality is not available in the Expo Go app" or similar.
    console.warn('[Push] Registration skipped (graceful):', err instanceof Error ? err.message : err);
  }
}
