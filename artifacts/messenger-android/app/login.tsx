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
        <Text style={styles.title}>Мессенджер</Text>
        <Text style={styles.subtitle}>Войдите в аккаунт</Text>

        <Text style={styles.label}>Имя пользователя</Text>
        <TextInput
          style={styles.input}
          value={userId}
          onChangeText={setUserId}
          placeholder="ivan"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => pinRef.current?.focus()}
        />

        <Text style={styles.label}>PIN-код (6 цифр)</Text>
        <TextInput
          ref={pinRef}
          style={styles.input}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          secureTextEntry
          keyboardType="number-pad"
          maxLength={6}
          returnKeyType="done"
          onSubmitEditing={() => void handleLogin()}
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={() => void handleLogin()}
          disabled={loading}
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
          <Text style={styles.serverBtnText}>Сменить сервер</Text>
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
    fontSize: 32,
    fontWeight: '700',
    color: C.primary,
    fontFamily: 'Inter_700Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: C.mutedForeground,
    textAlign: 'center',
    marginBottom: 40,
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
    marginBottom: 20,
    fontFamily: 'Inter_400Regular',
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: colors.radius,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  serverBtn: { marginTop: 20, alignItems: 'center' },
  serverBtnText: {
    color: C.mutedForeground,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
