import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getMe } from '@/api/client';
import colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { getServerUrl } from '@/services/serverConfig';

export default function SplashScreen() {
  const router = useRouter();
  const { restoreAuth, clearAuth } = useAuth();

  useEffect(() => {
    void initialize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initialize() {
    try {
      const serverUrl = await getServerUrl();
      if (!serverUrl) {
        router.replace('/server-config');
        return;
      }

      const hasAuth = await restoreAuth();
      if (!hasAuth) {
        router.replace('/login');
        return;
      }

      try {
        await getMe();
        router.replace('/chat-list');
      } catch {
        await clearAuth();
        router.replace('/login');
      }
    } catch {
      router.replace('/server-config');
    }
  }

  const C = colors.light;

  return (
    <View style={styles.container}>
      {/* Wordmark — Minimal style: large bold text + blue dot accent */}
      <View style={styles.brand}>
        <Text style={styles.wordmark}>Мессенджер</Text>
        <View style={styles.dot} />
      </View>
      <ActivityIndicator
        size="large"
        color={C.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
  },
  brand: {
    alignItems: 'center',
    gap: 16,
    marginBottom: 64,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -1,
    fontFamily: 'Inter_700Bold',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.primary,
  },
  spinner: { marginTop: 0 },
});
