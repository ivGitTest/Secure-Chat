import React, { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Noble, muted avatar palette — one distinct color per visible contact */
const AVATAR_COLORS = colors.light.contactsAvatarColors;
function avatarColor(index: number): string {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export default function ChatListScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { users, userId, clearAuth, refreshUsers } = useAuth();
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

  function renderHeader() {
    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Контакты</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={handleInfo}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="О приложении"
          >
            <Ionicons name="information-circle-outline" size={26} color={C.contactsSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleLogout()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="Выйти"
          >
            <Ionicons name="log-out-outline" size={26} color={C.contactsLogout} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {renderHeader()}
        <View style={styles.center}>
          <Ionicons name="people-outline" size={56} color={C.contactsMuted} />
          <Text style={styles.emptyText}>Нет других пользователей</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadData()}>
            <Text style={styles.retryText}>Обновить</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {renderHeader()}
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
        renderItem={({ item, index }) => {
          const unread = 0; // unreadCount not yet in API
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => handleUserPress(item)}
              activeOpacity={0.7}
            >
              {/* Avatar */}
              <View style={[styles.avatar, { backgroundColor: avatarColor(index) }]}>
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
  root: {
    flex: 1,
    backgroundColor: C.contactsBackground,
  },
  header: {
    height: 80,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.contactsBorder,
    flexShrink: 0,
  },
  headerTitle: {
    color: C.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  headerIconButton: {
    padding: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.contactsBackground,
    gap: 12,
  },
  emptyText: { fontSize: 16, color: C.contactsMuted, fontFamily: 'Inter_400Regular' },
  retryBtn: { marginTop: 8, minHeight: 48, justifyContent: 'center' },
  retryText: { color: C.primary, fontSize: 16, fontFamily: 'Inter_700Bold' },
  list: { paddingHorizontal: 16, paddingVertical: 8 },
  updateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.contactsBackground,
    borderBottomWidth: 1,
    borderBottomColor: C.contactsBorder,
  },
  updateBannerText: {
    flex: 1,
    fontSize: 15,
    color: C.primary,
    fontFamily: 'Inter_700Bold',
  },
  // Flat rows from ContactsV2 — no card background, border, shadow, or gaps.
  separator: {
    height: 1,
    marginHorizontal: 70,
    backgroundColor: C.contactsBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: C.primaryForeground,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  rowContent: { flex: 1, minWidth: 0 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  userName: {
    fontSize: 17,
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
    fontSize: 15,
    color: C.contactsSecondary,
    fontFamily: 'Inter_400Regular',
  },
  lastMsgUnread: {
    color: C.text,
    fontFamily: 'Inter_700Bold',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: C.primaryForeground,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
