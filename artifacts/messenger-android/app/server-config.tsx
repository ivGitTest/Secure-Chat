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
            onPress: () => { void save(trimmed); },
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
        <Text style={styles.title}>Сервер</Text>
        <Text style={styles.subtitle}>
          Укажите адрес семейного сервера для подключения.
        </Text>

        <Text style={styles.label}>АДРЕС СЕРВЕРА</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://chat.example.com"
          placeholderTextColor={C.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={() => void handleSave()}
        />

        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={() => void handleSave()}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Продолжить</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  inner: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 48,
  },
  title: {
    fontSize: 44,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -1,
    marginBottom: 12,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    fontSize: 20,
    color: C.mutedForeground,
    fontWeight: '500',
    lineHeight: 28,
    marginBottom: 48,
    fontFamily: 'Inter_500Medium',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#A1A1AA',
    marginBottom: 12,
    fontFamily: 'Inter_700Bold',
  },
  input: {
    backgroundColor: C.input,
    borderBottomWidth: 4,
    borderBottomColor: C.border,
    paddingHorizontal: 20,
    paddingVertical: 20,
    fontSize: 22,
    fontWeight: '500',
    color: C.text,
    fontFamily: 'Inter_500Medium',
  },
  btnWrap: { marginTop: 'auto', paddingTop: 32 },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 20,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
