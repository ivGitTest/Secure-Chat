import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
import { getServerUrl, setServerUrl } from '@/services/serverConfig';

export default function ServerConfigScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getServerUrl().then((saved) => {
      if (saved) setUrl(saved);
    });
  }, []);

  async function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('Ошибка', 'Введите адрес сервера');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('Ошибка', 'Адрес должен начинаться с http:// или https://');
      return;
    }

    setLoading(true);
    try {
      // Quick reachability check.
      // AbortSignal.timeout() is not supported in React Native / Hermes —
      // use a manual AbortController + setTimeout instead.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let resp: Response;
      try {
        resp = await fetch(`${trimmed}/api/v1/health`, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) throw new Error('Сервер недоступен');
    } catch {
      Alert.alert(
        'Предупреждение',
        'Не удалось подключиться к серверу. Сохранить адрес всё равно?',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Сохранить',
            onPress: () => {
              void save(trimmed);
            },
          },
        ],
      );
      setLoading(false);
      return;
    }

    await save(trimmed);
  }

  async function save(trimmed: string) {
    await setServerUrl(trimmed);
    router.replace('/login');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Настройки сервера</Text>
        <Text style={styles.subtitle}>
          Введите адрес вашего сервера-мессенджера
        </Text>

        <Text style={styles.label}>Адрес сервера</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://chat.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={() => void handleSave()}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleSave()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Сохранить</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: C.mutedForeground,
    marginBottom: 32,
    fontFamily: 'Inter_400Regular',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: C.mutedForeground,
    marginBottom: 8,
    fontFamily: 'Inter_600SemiBold',
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: colors.radius,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.card,
    marginBottom: 24,
    fontFamily: 'Inter_400Regular',
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});
