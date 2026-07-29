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
}

function MessageBubble({ message, isMe }: MessageBubbleProps) {
  return (
    <View style={[styles.bubbleWrap, isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {message.text}
        </Text>
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
          {formatTime(message.createdAt)}
        </Text>
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
        setMessages([...msgs].reverse());
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
      if (!messageId || !clientId) return;
      const tempId = pendingRef.current.get(clientId);
      if (!tempId) return;
      pendingRef.current.delete(clientId);
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, id: messageId } : m),
      );
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
      <FlatList<Message>
        data={messages}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.msgList}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        scrollEnabled={messages.length > 0}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Начните переписку</Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageBubble message={item} isMe={item.senderId === userId} />
        )}
      />

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Сообщение…"
          multiline
          returnKeyType="default"
          placeholderTextColor={C.mutedForeground}
        />
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    transform: [{ scaleY: -1 }],
  },
  emptyText: { fontSize: 15, color: C.mutedForeground, fontFamily: 'Inter_400Regular' },
  bubbleWrap: { flexDirection: 'row', marginVertical: 3 },
  bubbleWrapMe: { justifyContent: 'flex-end' },
  bubbleWrapThem: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMe: {
    backgroundColor: C.bubbleMe,
    borderBottomRightRadius: 4,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  bubbleThem: {
    backgroundColor: C.bubbleThem,
    borderBottomLeftRadius: 4,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  bubbleTextMe: { color: C.bubbleMeText },
  bubbleTextThem: { color: C.bubbleThemText },
  bubbleTime: { fontSize: 11, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  bubbleTimeThem: { color: C.mutedForeground },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: C.border,
    backgroundColor: C.card,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
    backgroundColor: C.background,
    maxHeight: 120,
    fontFamily: 'Inter_400Regular',
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: C.border,
    shadowOpacity: 0,
    elevation: 0,
  },
});
