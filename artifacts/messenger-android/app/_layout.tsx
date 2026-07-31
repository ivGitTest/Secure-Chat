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
import { AuthProvider } from '@/context/AuthContext';
import { CallProvider } from '@/context/CallContext';
import { setupNotificationChannels } from '@/services/notificationService';
import { setupCallKeep } from '@/services/callkeepService';
import RNCallKeep from 'react-native-callkeep';

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
          options={{ title: 'Семья', headerBackVisible: false }}
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

  // Initialize CallKeep (Android ConnectionService) as early as possible.
  // After setup, check that the calling account is enabled in Android Settings.
  // Without it, TelecomManager.addNewIncomingCall() may not show the lock-screen
  // call UI on some devices — the user must explicitly enable it once.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void (async () => {
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
                onPress: () => RNCallKeep.openPhoneAccountSettings(),
              },
            ],
          );
        }
      } catch {
        // Non-critical — skip silently if the check fails
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
