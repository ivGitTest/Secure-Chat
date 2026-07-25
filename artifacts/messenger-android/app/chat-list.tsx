import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';

const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.1';
import { getConversations } from '@/api/client';
import colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import type { Conversation, User } from '@/types';

interface ContactRow {
  user: User;
  conversation: Conversation | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 86_400_000) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function ChatListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { users, userId, userName, clearAuth, refreshUsers } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [convs] = await Promise.all([getConversations(), refreshUsers()]);
      setConversations(convs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Load on mount and on every focus
  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void loadData(true));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: userName ?? 'Чаты',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <TouchableOpacity
            onPress={handleInfo}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 6 }}
          >
            <Ionicons name="information-circle-outline" size={24} color={C.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleLogout()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 6 }}
          >
            <Ionicons name="log-out-outline" size={24} color={C.destructive} />
          </TouchableOpacity>
        </View>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, userName]);

  async function handleLogout() {
    await clearAuth();
    router.replace('/login');
  }

  function handleInfo() {
    Alert.alert(
      'Семейный мессенджер',
      `Версия ${APP_VERSION}\n\nЗакрытый семейный мессенджер с поддержкой голосовых звонков.`,
      [{ text: 'OK' }],
    );
  }

  function handleUserPress(row: ContactRow) {
    const params = new URLSearchParams({
      recipientId: row.user.id,
      recipientName: row.user.name,
    });
    if (row.conversation) {
      router.push(`/chat/${row.conversation.id}?${params.toString()}`);
    } else {
      router.push(`/chat/new?${params.toString()}`);
    }
  }

  // Merge users (excluding self) with their conversations
  const rows: ContactRow[] = users
    .filter((u) => u.id !== userId)
    .map((user) => ({
      user,
      conversation: conversations.find((c) => c.participantId === user.id) ?? null,
    }));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Ionicons name="people-outline" size={56} color={C.mutedForeground} />
        <Text style={styles.emptyText}>Нет других пользователей</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => void loadData()}
        >
          <Text style={styles.retryText}>Обновить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList<ContactRow>
      data={rows}
      keyExtractor={(item) => item.user.id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void loadData(true);
          }}
          tintColor={C.primary}
        />
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleUserPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.userName}>{item.user.name}</Text>
            <Text style={styles.lastMsg} numberOfLines={1}>
              {item.conversation?.lastMessage ?? 'Нет сообщений'}
            </Text>
          </View>
          {item.conversation?.lastMessageTime && (
            <Text style={styles.time}>
              {formatTime(item.conversation.lastMessageTime)}
            </Text>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: C.background,
  },
  emptyText: {
    fontSize: 16,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  retryBtn: { marginTop: 8 },
  retryText: {
    color: C.primary,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  list: {
    backgroundColor: C.background,
  },
  separator: { height: 1, backgroundColor: C.border, marginLeft: 72 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.background,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  rowContent: { flex: 1 },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 3,
  },
  lastMsg: {
    fontSize: 14,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  time: {
    fontSize: 12,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
    marginLeft: 8,
  },
});
