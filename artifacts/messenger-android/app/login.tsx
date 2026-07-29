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
        <Text style={styles.title}>Вход</Text>
        <Text style={styles.subtitle}>Как вас зовут и какой у вас код?</Text>

        <View style={styles.fields}>
          {/* Username */}
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

          {/* PIN */}
          <Text style={[styles.label, { marginTop: 32 }]}>PIN-КОД</Text>
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

        {/* CTA pinned to bottom third */}
        <View style={styles.btnWrap}>
          <TouchableOpacity
            style={[
              styles.btn,
              (loading || !userId.trim() || pin.length !== 6) && styles.btnDisabled,
            ]}
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
            activeOpacity={0.7}
          >
            <Text style={styles.serverBtnText}>Изменить сервер</Text>
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
  fields: { flex: 1 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#A1A1AA', // zinc-400
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
  pinInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 10,
    fontFamily: 'Inter_700Bold',
  },
  btnWrap: {
    marginTop: 'auto',
    paddingTop: 32,
    gap: 16,
  },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 20,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  serverBtn: { alignItems: 'center', paddingVertical: 8, minHeight: 48 },
  serverBtnText: {
    color: C.mutedForeground,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
  },
});
