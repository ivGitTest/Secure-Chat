import React, { useRef, useState } from 'react';
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
import { login } from '@/api/client';
import colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { getDeviceId } from '@/utils/deviceId';

export default function LoginScreen() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<TextInput>(null);

  async function handleLogin() {
    const uid = userId.trim();
    if (!uid) {
      Alert.alert('Ошибка', 'Введите имя пользователя');
      return;
    }
    if (pin.length !== 6) {
      Alert.alert('Ошибка', 'PIN должен содержать ровно 6 цифр');
      return;
    }

    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const response = await login(uid, pin, deviceId);
      await setAuth(response.accessToken, response.user.id, response.user.name);
      router.replace('/chat-list');
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        Alert.alert('Ошибка', 'Неверный PIN-код');
      } else if (status === 403) {
        Alert.alert('Аккаунт заблокирован', 'Обратитесь к администратору');
      } else if (status === 404) {
        Alert.alert('Ошибка', 'Пользователь не найден');
      } else {
        Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
    >
      <View style={styles.inner}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <View style={styles.icon}>
            <Text style={styles.iconGlyph}>👤</Text>
          </View>
        </View>

        <Text style={styles.title}>Авторизация</Text>
        <Text style={styles.subtitle}>Войдите в семейный мессенджер</Text>

        <View style={styles.fields}>
          <Text style={styles.label}>ИМЯ ПОЛЬЗОВАТЕЛЯ</Text>
          <TextInput
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
            placeholder="user id"
            placeholderTextColor={C.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
          />

          <Text style={[styles.label, { marginTop: 20 }]}>PIN-КОД (6 ЦИФР)</Text>
          <TextInput
            ref={pinRef}
            style={[styles.input, styles.pinInput]}
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            placeholderTextColor={C.mutedForeground}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={() => void handleLogin()}
          />
        </View>

        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[styles.btn, (loading || !userId.trim() || pin.length !== 6) && styles.btnDisabled]}
            onPress={() => void handleLogin()}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Войти</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.serverBtn}
            onPress={() => router.push('/server-config')}
          >
            <Text style={styles.serverBtnText}>← Сменить сервер</Text>
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
    paddingTop: 72,
    paddingBottom: 40,
  },
  iconWrap: { alignItems: 'center', marginBottom: 28 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  iconGlyph: { fontSize: 30 },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: C.mutedForeground,
    textAlign: 'center',
    marginBottom: 36,
    fontFamily: 'Inter_400Regular',
  },
  fields: { gap: 0 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.mutedForeground,
    marginBottom: 8,
    fontFamily: 'Inter_700Bold',
  },
  input: {
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 17,
    color: C.text,
    backgroundColor: C.card,
    fontFamily: 'Inter_400Regular',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  pinInput: {
    fontSize: 22,
    letterSpacing: 6,
  },
  btnWrap: { marginTop: 'auto', paddingTop: 32, gap: 12 },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  serverBtn: { alignItems: 'center', paddingVertical: 8 },
  serverBtnText: {
    color: C.mutedForeground,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
});
