import React, { useEffect } from 'react';
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

// ---------------------------------------------------------------------------
// Foreground notification handler — runs before the notification is displayed.
// Messages are suppressed (WebSocket delivers them live in the UI).
// Calls are shown (belt-and-suspenders alongside the WebSocket path).
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { type?: string };
    // Suppress message notifications in foreground — WebSocket delivers them live in the UI
    if (data?.type === 'message') {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    // Show call notifications (belt-and-suspenders alongside the WebSocket path)
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
// NotificationTapHandler — must live inside the expo-router tree so useRouter works.
// Handles what happens when the user taps a push notification.
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
        // Navigate to the relevant chat
        router.push(`/chat/${data.conversationId}`);
      }
      // For call type: the app opens and the WebSocket delivers call.incoming;
      // CallContext handles it from there. No extra navigation needed.
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <>
      {/* Handles notification taps — needs to be inside router tree for useRouter */}
      <NotificationTapHandler />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="server-config"
          options={{ title: 'Настройки сервера', headerBackTitle: 'Назад' }}
        />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="chat-list"
          options={{ title: 'Чаты', headerBackVisible: false }}
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

  // Create notification channels at app startup — not just after login.
  // The 'calls' channel must exist before the first push arrives (e.g. when
  // the app is in the background and the user hasn't visited chat-list yet).
  useEffect(() => {
    void setupNotificationChannels();
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
