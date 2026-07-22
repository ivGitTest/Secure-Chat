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

      // Validate the token by calling the API
      try {
        await getMe();
        router.replace('/chat-list');
      } catch {
        // Token expired or invalid — clear and go to login
        await clearAuth();
        router.replace('/login');
      }
    } catch {
      router.replace('/server-config');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Мессенджер</Text>
      <ActivityIndicator
        size="large"
        color={colors.light.primary}
        style={{ marginTop: 32 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.background,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.light.primary,
    fontFamily: 'Inter_700Bold',
  },
});
