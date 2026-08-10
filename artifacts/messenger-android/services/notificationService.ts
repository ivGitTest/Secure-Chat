/**
 * Push notification registration for the family messenger app.
 *
 * Registers two kinds of push tokens with the server after login:
 *
 * 1. Expo push token  — for message push notifications (via Expo Push Service → FCM).
 * 2. FCM token        — for VoIP call notifications (direct FCM data-only push).
 *    The FCM token allows the server to wake the app even when killed and trigger
 *    the Android ConnectionService (CallKeep) incoming-call screen.
 *
 * Graceful degradation: any error is logged silently; the app continues without
 * push. Real-time delivery still works via WebSocket while the app is active.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import messaging from '@react-native-firebase/messaging';
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
    bypassDnd: true,        // ring even in Do-Not-Disturb (important on Xiaomi MIUI)
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
 * Also registers the FCM token for VoIP call notifications.
 * Must be called after the user is authenticated (needs a valid JWT on the server).
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await setupNotificationChannels();

    // Request notification permission — Android 13+ shows the dialog once.
    await Notifications.requestPermissionsAsync();

    // ── Expo push token (for message notifications) ──────────────────────────
    let expoToken: string | undefined;
    try {
      const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
      expoToken = tokenResult.data;
    } catch (err) {
      console.warn('[Push] Expo token unavailable (graceful):', err instanceof Error ? err.message : err);
    }

    // ── FCM token (for VoIP call push) ───────────────────────────────────────
    let fcmToken: string | undefined;
    try {
      // Request FCM permission (on Android 13+ this is the same as POST_NOTIFICATIONS)
      const authStatus = await messaging().requestPermission();
      const authorized =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (authorized) {
        fcmToken = await messaging().getToken();
        if (__DEV__) console.log('[Push] FCM token acquired (dev only)');
      }
    } catch (err) {
      console.warn('[Push] FCM token unavailable (graceful):', err instanceof Error ? err.message : err);
    }

    // ── Register tokens with the server ─────────────────────────────────────
    if (expoToken) {
      await registerPushToken(expoToken, fcmToken);
      console.log('[Push] Tokens registered (Expo + FCM)');
    } else if (fcmToken) {
      // FCM only — will be updated when Expo token becomes available
      await registerPushToken('pending', fcmToken);
      console.log('[Push] FCM token registered (Expo token pending)');
    } else {
      console.warn('[Push] No tokens available — push notifications disabled');
    }
  } catch (err) {
    console.warn('[Push] Registration skipped (graceful):', err instanceof Error ? err.message : err);
  }
}
