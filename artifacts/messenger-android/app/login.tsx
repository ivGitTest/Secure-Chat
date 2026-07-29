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
import { Ionicons } from '@expo/vector-icons';
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
        {/* Icon tile + glow */}
        <View style={styles.iconArea}>
          <View style={styles.iconGlow} />
          <View style={styles.iconTile}>
            <Ionicons name="person-outline" size={32} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>Авторизация</Text>
        <Text style={styles.subtitle}>Войдите в семейный мессенджер</Text>

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
    // React Native doesn't support CSS blur; approximate with opacity
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
  fields: { flex: 1 },
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
  pinInput: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    fontFamily: 'Inter_700Bold',
  },
  btnWrap: {
    marginTop: 'auto',
    paddingTop: 32,
    gap: 16,
  },
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
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: C.primaryForeground,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  serverBtn: { alignItems: 'center', paddingVertical: 8, minHeight: 48 },
  serverBtnText: {
    color: C.mutedForeground,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
});
