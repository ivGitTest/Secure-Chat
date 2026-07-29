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

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <View style={styles.logo}>
          <Text style={styles.logoGlyph}>💬</Text>
        </View>
      </View>
      <Text style={styles.title}>Мессенджер</Text>
      <ActivityIndicator
        size="large"
        color={colors.light.primary}
        style={{ marginTop: 40 }}
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
  logoWrap: { marginBottom: 24 },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: colors.light.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.light.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  logoGlyph: { fontSize: 40 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.light.text,
    fontFamily: 'Inter_700Bold',
  },
});
