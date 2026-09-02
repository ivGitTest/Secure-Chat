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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
import { getServerUrl, setServerUrl } from '@/services/serverConfig';

export default function ServerConfigScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('https://chat.example.com');
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
        {/* Icon tile + glow */}
        <View style={styles.iconArea}>
          <View style={styles.iconGlow} />
          <View style={styles.iconTile}>
            <Ionicons name="server-outline" size={32} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Настройка сервера</Text>
        <Text style={styles.subtitle}>
          Введите адрес семейного сервера
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
    paddingTop: 60,
    paddingBottom: 48,
  },

  // ── Icon tile ──
  iconArea: { alignItems: 'center', marginBottom: 28 },
  iconGlow: {
    position: 'absolute',
    top: -8,
    width: 92,
    height: 92,
    borderRadius: 30,
    backgroundColor: 'rgba(0,68,255,0.22)',
    opacity: 0.7,
    transform: [{ scale: 1.3 }],
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    fontSize: 16,
    color: C.mutedForeground,
    lineHeight: 22,
    marginBottom: 40,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#A1A1AA',
    marginBottom: 8,
    fontFamily: 'Inter_700Bold',
  },
  // Glass card input — full border, rounded
  input: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    fontWeight: '500',
    color: C.text,
    fontFamily: 'Inter_500Medium',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  btnWrap: { marginTop: 'auto', paddingTop: 32 },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
