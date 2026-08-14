import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** Simple UUID v4 generator — works in Hermes without expo-crypto. */
function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMessages } from '@/api/client';
import colors from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useCall } from '@/context/CallContext';
import { wsService } from '@/services/wsService';
import type { Message } from '@/types';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MessageBubbleProps {
  message: Message;
  isMe: boolean;
  delivered: boolean;
}

function MessageBubble({ message, isMe, delivered }: MessageBubbleProps) {
  const isTemp = message.id.startsWith('temp-');
  return (
    <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {message.text}
        </Text>
        <View style={styles.bubbleFooter}>
          <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
            {formatTime(message.createdAt)}
          </Text>
          {isMe && !isTemp && (
            <Ionicons
              name="checkmark"
              size={16}
              color={delivered ? '#059669' : 'rgba(31,58,82,0.62)'}
            />
          )}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    id: string;
    recipientId: string;
    recipientName: string;
  }>();
  const { id, recipientId, recipientName } = params;
  const isNew = id === 'new';

  const { userId } = useAuth();
  const { makeCall, callState } = useCall();
  const insets = useSafeAreaInsets();

  const { height: kbdHeight } = useReanimatedKeyboardAnimation();
  const keyboardSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, -kbdHeight.value),
  }));

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [currentConvId, setCurrentConvId] = useState<string | undefined>(
    isNew ? undefined : id,
  );

  const pendingRef = useRef<Map<string, string>>(new Map());
  /** IDs of incoming messages that need an ACK but haven't been confirmed yet. */
  const pendingAckRef = useRef<Set<string>>(new Set());
  const [deliveredIds, setDeliveredIds] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: recipientName ?? recipientId,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => void handleCall()}
          style={{ marginRight: 16 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={callState !== 'idle'}
        >
          <Ionicons
            name="call"
            size={22}
            color={callState === 'idle' ? C.primary : C.mutedForeground}
          />
        </TouchableOpacity>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, recipientName, recipientId, callState]);

  useEffect(() => {
    if (isNew) return;
    void (async () => {
      try {
        const msgs = await getMessages(id);
        const reversed = [...msgs].reverse();
        setMessages(reversed);
        setDeliveredIds(new Set(reversed.filter((m) => m.deliveredAt != null).map((m) => m.id)));
        // Enqueue ACKs for incoming messages that have no delivery confirmation yet.
        // We await the socket connection because send() silently drops when not OPEN.
        // The 'connect' listener below retries if the socket drops and reconnects.
        const unacked = reversed.filter(
          (m) => m.senderId !== userId && m.deliveredAt == null,
        );
        if (unacked.length > 0) {
          pendingAckRef.current = new Set(unacked.map((m) => m.id));
          void (async () => {
            try {
              await wsService.waitForConnect(15_000);
            } catch {
              return; // timed out — 'connect' listener will retry
            }
            for (const id of pendingAckRef.current) {
              wsService.send({ type: 'message.ack', payload: { messageId: id } });
            }
          })();
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  useEffect(() => {
    const unsub = wsService.on('message.delivered', (payload) => {
      const messageId = payload['messageId'] as string | undefined;
      const clientId = payload['clientId'] as string | undefined;
      if (!messageId) return;

      if (clientId) {
        // Server storage ack: swap optimistic temp ID → real server ID
        const tempId = pendingRef.current.get(clientId);
        if (!tempId) return;
        pendingRef.current.delete(clientId);
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, id: messageId } : m),
        );
      } else {
        // Delivery ack relayed from recipient device → green checkmark
        pendingAckRef.current.delete(messageId);
        setDeliveredIds((prev) => new Set(prev).add(messageId));
      }
    });
    return unsub;
  }, []);

  // Retry pending history ACKs whenever the socket reconnects (covers dropped-then-restored connections).
  useEffect(() => {
    const unsub = wsService.on('connect', () => {
      for (const id of pendingAckRef.current) {
        wsService.send({ type: 'message.ack', payload: { messageId: id } });
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = wsService.on('message.new', (payload) => {
      const convId = payload['conversationId'] as string | undefined;
      const senderId = payload['senderId'] as string | undefined;
      const isOurConv = convId && (convId === currentConvId || (isNew && senderId === recipientId));
      if (!isOurConv) return;
      if (!currentConvId && convId) setCurrentConvId(convId);
      const msgId = payload['id'] as string;
      const newMsg: Message = {
        id: msgId,
        senderId: senderId ?? '',
        text: payload['text'] as string,
        createdAt: payload['createdAt'] as string,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msgId)) return prev;
        return [newMsg, ...prev];
      });
      // Auto-ACK incoming messages so the sender gets a delivery confirmation.
      if (senderId && senderId !== userId) {
        wsService.send({ type: 'message.ack', payload: { messageId: msgId } });
      }
    });
    return unsub;
  }, [currentConvId, isNew, recipientId]);

  function sendMessage() {
    const text = inputText.trim();
    if (!text) return;
    if (!wsService.isConnected()) {
      Alert.alert('Ошибка', 'Нет соединения с сервером');
      return;
    }
    const clientId = uuid4();
    const tempId = `temp-${clientId}`;
    pendingRef.current.set(clientId, tempId);
    const tempMsg: Message = {
      id: tempId,
      senderId: userId ?? '',
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [tempMsg, ...prev]);
    setInputText('');
    const payload: Record<string, unknown> = { text, clientId };
    if (currentConvId) {
      payload['conversationId'] = currentConvId;
    } else {
      payload['recipientId'] = recipientId;
    }
    wsService.send({ type: 'message.send', payload });
  }

  const handleCall = useCallback(async () => {
    if (!recipientId) return;
    await makeCall(recipientId, recipientName ?? recipientId);
  }, [recipientId, recipientName, makeCall]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {messages.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Нет истории переписки</Text>
        </View>
      ) : (
        <FlatList<Message>
          data={messages}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.msgList}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMe={item.senderId === userId}
              delivered={deliveredIds.has(item.id)}
            />
          )}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.inputShell}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Сообщение…"
            multiline
            returnKeyType="default"
            placeholderTextColor={C.mutedForeground}
            underlineColorAndroid="transparent"
            textAlignVertical="center"
          />
        </View>
        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim()}
          activeOpacity={0.85}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <Animated.View style={keyboardSpacerStyle} />
    </View>
  );
}

const C = colors.light;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
  msgList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 4,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: { fontSize: 16, color: C.mutedForeground, fontFamily: 'Inter_400Regular' },

  // Bubbles — Minimal: large rounded, sharp tail corner
  bubbleWrap: { flexDirection: 'row', marginVertical: 1 },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubbleWrapThem: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: C.bubbleMe,
    borderBottomRightRadius: 6,
  },
  bubbleThem: {
    backgroundColor: C.bubbleThem,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: { fontSize: 18, fontFamily: 'Inter_400Regular', lineHeight: 25 },
  bubbleTextMe: { color: C.bubbleMeText },
  bubbleTextThem: { color: C.bubbleThemText },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginTop: 3,
  },
  bubbleTime: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  bubbleTimeMe: { color: 'rgba(31,58,82,0.62)' },
  bubbleTimeThem: { color: C.mutedForeground },

  // Input bar — pill-shaped container, no top border
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: C.background,
    gap: 10,
  },
  inputShell: {
    flex: 1,
    minHeight: 52,
    maxHeight: 120,
    justifyContent: 'center',
    backgroundColor: C.input,
    borderRadius: 28,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '500',
    color: C.text,
    maxHeight: 120,
    fontFamily: 'Inter_500Medium',
    minHeight: 52,
  },
  sendBtn: {
    width: 56,
    height: 56,
    borderRadius: 14, // rounded square like mockup, not full circle
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: C.border,
    shadowOpacity: 0,
    elevation: 0,
  },
});
