import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { getConversations } from '@/api/client';
import colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { registerForPushNotifications } from '@/services/notificationService';
import { checkForUpdate, type UpdateInfo } from '@/services/updateService';
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

/** Deterministic color per initial letter */
const AVATAR_COLORS = [
  '#0044FF', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626',
];
function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ChatListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { users, userId, userName, clearAuth, refreshUsers } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

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

  useEffect(() => {
    void loadData();
    void registerForPushNotifications();
    void checkForUpdate().then(setUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => void loadData(true));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Семья',
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
    router.push('/version');
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
        <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()}>
          <Text style={styles.retryText}>Обновить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      {update && (
        <TouchableOpacity
          style={styles.updateBanner}
          onPress={() => router.push('/version')}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-up-circle" size={20} color={C.primary} />
          <Text style={styles.updateBannerText}>
            Доступна версия {update.versionName} — нажмите, чтобы обновить
          </Text>
        </TouchableOpacity>
      )}
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
        renderItem={({ item }) => {
          const unread = 0; // unreadCount not yet in API
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleUserPress(item)}
              activeOpacity={0.7}
            >
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.user.name) }]}>
                <Text style={styles.avatarText}>
                  {item.user.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              {/* Content */}
              <View style={styles.rowContent}>
                <View style={styles.rowTop}>
                  <Text style={styles.userName}>{item.user.name}</Text>
                  {item.conversation?.lastMessageTime && (
                    <Text style={[styles.time, unread > 0 && styles.timeUnread]}>
                      {formatTime(item.conversation.lastMessageTime)}
                    </Text>
                  )}
                </View>
                <View style={styles.rowBottom}>
                  <Text style={[styles.lastMsg, unread > 0 && styles.lastMsgUnread]} numberOfLines={1}>
                    {item.conversation?.lastMessage ?? 'Нет сообщений'}
                  </Text>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    gap: 12,
  },
  emptyText: { fontSize: 16, color: C.mutedForeground, fontFamily: 'Inter_400Regular' },
  retryBtn: { marginTop: 8, minHeight: 48, justifyContent: 'center' },
  retryText: { color: C.primary, fontSize: 16, fontFamily: 'Inter_700Bold' },
  list: { paddingVertical: 8 },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: `${C.primary}0D`, // 5% opacity
    borderBottomWidth: 2,
    borderBottomColor: `${C.primary}20`,
  },
  updateBannerText: {
    flex: 1,
    fontSize: 15,
    color: C.primary,
    fontFamily: 'Inter_700Bold',
  },
  // Plain divider between rows — no card borders
  separator: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: C.background,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28, // full circle
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    fontFamily: 'Inter_700Bold',
  },
  time: {
    fontSize: 13,
    fontWeight: '700',
    color: C.mutedForeground,
    fontFamily: 'Inter_700Bold',
    marginLeft: 4,
  },
  timeUnread: { color: C.primary },
  lastMsg: {
    flex: 1,
    fontSize: 16,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  lastMsgUnread: {
    color: C.text,
    fontFamily: 'Inter_700Bold',
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
