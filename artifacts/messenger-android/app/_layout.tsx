import React, { useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import { AuthProvider } from '@/context/AuthContext';
import { CallProvider } from '@/context/CallContext';
import { setupNotificationChannels } from '@/services/notificationService';
import { setupCallKeep } from '@/services/callkeepService';
import RNCallKeep from 'react-native-callkeep';

/** Package name — must match app.json android.package */
const APP_PACKAGE = 'com.ivaexpi.messengerandroid';
/** AsyncStorage key so we only prompt once */
const BATTERY_OPT_ASKED_KEY = 'battery_opt_asked_v1';

// ---------------------------------------------------------------------------
// Foreground notification handler — runs before the notification is displayed.
// Messages are suppressed (WebSocket delivers them live in the UI).
// Call notifications via Expo Push are shown as a fallback (when FCM token is
// unavailable). The primary call notification path is FCM data-only → CallKeep.
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { type?: string };
    if (data?.type === 'message') {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    // Show Expo call notifications only as a fallback (no FCM token).
    // Primary path: FCM data-only → background handler → CallKeep.
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

// ---------------------------------------------------------------------------
// NotificationTapHandler — handles Expo push notification taps.
// ---------------------------------------------------------------------------
function NotificationTapHandler() {
  const router = useRouter();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        conversationId?: string;
      };
      if (data?.type === 'message' && data?.conversationId) {
        router.push(`/chat/${data.conversationId}`);
      }
      // For call type: app opens and WS delivers call.incoming;
      // CallContext handles it via CallKeep from there.
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <>
      <NotificationTapHandler />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0044FF',
          headerTitleStyle: { fontFamily: 'Inter_700Bold', color: '#09090b', fontSize: 17 },
          headerShadowVisible: true,
          contentStyle: { backgroundColor: '#FFFFFF' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="server-config" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat-list"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="chat/[id]"
          options={{ title: '', headerBackTitle: 'Назад' }}
        />
        <Stack.Screen
          name="version"
          options={{ title: 'О приложении', headerBackTitle: 'Назад' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Create notification channels at app startup so the 'calls' channel
  // exists before the first push arrives.
  useEffect(() => {
    void setupNotificationChannels();
  }, []);

  // Initialize CallKeep and request the two Android permissions required for
  // reliable incoming calls:
  //
  //  1. Calling account — must be enabled once by the user in Android Settings
  //     (Settings → Phone → Calling accounts). Without it TelecomManager may
  //     not show the system call screen on some devices.
  //
  //  2. Battery optimisation exemption — the most common reason calls are missed
  //     when the app is fully killed (swiped from Recent Apps). On Xiaomi/MIUI,
  //     Samsung One UI, OPPO ColorOS and similar skins the OS blocks FCM from
  //     starting a killed app unless it is whitelisted. After the user grants
  //     "Unrestricted" battery usage, FCM can wake the process even from dead.
  //     We store a flag so the dialog only appears once per install.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void (async () => {
      // ── 1. CallKeep setup + calling account ─────────────────────────────────
      await setupCallKeep();
      try {
        const enabled = await RNCallKeep.checkPhoneAccountEnabled();
        if (!enabled) {
          Alert.alert(
            'Включите аккаунт звонков',
            'Чтобы видеть входящий звонок на заблокированном экране, разрешите мессенджеру управлять звонками в настройках телефона.',
            [
              { text: 'Позже', style: 'cancel' },
              {
                text: 'Открыть настройки',
                onPress: () => {
                  // RNCallKeep exposes this native method internally but does
                  // not include it in its TypeScript API. Use the public Expo
                  // intent launcher instead.
                  void IntentLauncher.startActivityAsync(
                    'android.telecom.action.CHANGE_PHONE_ACCOUNT_SETTINGS',
                  ).catch(() => {
                    void IntentLauncher.startActivityAsync(
                      'android.settings.MANAGE_DEFAULT_APPS_SETTINGS',
                    );
                  });
                },
              },
            ],
          );
        }
      } catch {
        // Non-critical
      }

      // ── 2. Battery optimisation exemption ────────────────────────────────────
      // Only prompt once; after the user acts (or dismisses) we never ask again.
      try {
        const asked = await AsyncStorage.getItem(BATTERY_OPT_ASKED_KEY);
        if (!asked) {
          await AsyncStorage.setItem(BATTERY_OPT_ASKED_KEY, '1');
          Alert.alert(
            'Разрешите работу в фоне',
            'Чтобы звонок приходил когда приложение закрыто, отключите оптимизацию батареи для мессенджера.\n\nНайдите его в списке и выберите «Без ограничений».',
            [
              { text: 'Позже', style: 'cancel' },
              {
                text: 'Открыть',
                onPress: () => {
                  // Opens the system dialog specifically for this app:
                  // "Keep <App> running in background? → Allow"
                  // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS is the standard
                  // intent for VoIP / alarm apps (WhatsApp, Telegram use this).
                  void IntentLauncher.startActivityAsync(
                    'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
                    { data: `package:${APP_PACKAGE}` },
                  ).catch(() => {
                    // Fallback: open the general battery optimisation list
                    void IntentLauncher.startActivityAsync(
                      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
                    );
                  });
                },
              },
            ],
          );
        }
      } catch {
        // Non-critical
      }
    })();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <CallProvider>
                <RootLayoutNav />
              </CallProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
