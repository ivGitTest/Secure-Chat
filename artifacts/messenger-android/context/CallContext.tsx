import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConfig } from '@/api/client';
import {
  RTCIceCandidate,
  RTCPeerConnection,
  mediaDevices,
} from '@/services/webrtcBridge';
import type { MediaStreamLike, MediaStreamTrackLike } from '@/services/webrtcBridge';
import { wsService } from '@/services/wsService';
import type { IncomingCallState } from '@/types';
import { useAuth } from './AuthContext';

type CallState = 'idle' | 'calling' | 'ringing' | 'in-call';

interface CallContextValue {
  callState: CallState;
  callPeer: { id: string; name: string } | null;
  incomingCall: IncomingCallState | null;
  makeCall: (calleeId: string, calleeName: string) => Promise<void>;
  endCall: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    // Check first — on Android 14 calling request() on an already-granted
    // permission can behave unexpectedly on some devices.
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (already) return true;

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Доступ к микрофону',
        message: 'Для голосовых звонков нужен доступ к микрофону',
        buttonPositive: 'Разрешить',
        buttonNegative: 'Отмена',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

function CallTimer({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const fmt = (n: number) => String(n).padStart(2, '0');
  return (
    <Text style={callStyles.timer}>
      {h > 0 ? `${fmt(h)}:` : ''}{fmt(m)}:{fmt(s)}
    </Text>
  );
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { users } = useAuth();
  const peerConnectionRef = useRef<InstanceType<typeof RTCPeerConnection> | null>(null);
  const localStreamRef = useRef<MediaStreamLike | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callPeer, setCallPeer] = useState<{ id: string; name: string } | null>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const cleanupCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setCallState('idle');
    setCallPeer(null);
    setCallStartTime(null);
    setIsMuted(false);
  }, []);

  const endCall = useCallback(() => {
    wsService.send({ type: 'call.end', payload: {} });
    cleanupCall();
  }, [cleanupCall]);

  // WS event subscriptions
  useEffect(() => {
    const subs = [
      wsService.on('call.incoming', (payload) => {
        const callerId = payload['callerId'] as string;
        const caller = users.find((u) => u.id === callerId);
        setIncomingCall({
          callerId,
          callerName: caller?.name ?? callerId,
        });
      }),

      wsService.on('call.accept', () => {
        // We are the caller — create and send offer
        const pc = peerConnectionRef.current;
        if (!pc) return;
        void (async () => {
          try {
            const offer = await pc.createOffer({});
            await pc.setLocalDescription(offer);
            wsService.send({
              type: 'webrtc.offer',
              payload: { sdp: offer.sdp, type: offer.type },
            });
            setCallState('in-call');
            setCallStartTime(new Date());
          } catch (e) {
            console.error('[Call] offer failed', e);
          }
        })();
      }),

      wsService.on('call.reject', () => {
        Alert.alert('Звонок', 'Вызов отклонён');
        cleanupCall();
      }),

      wsService.on('call.end', () => {
        cleanupCall();
      }),

      wsService.on('webrtc.offer', (payload) => {
        // We are the callee — set remote description and send answer
        const pc = peerConnectionRef.current;
        if (!pc) return;
        void (async () => {
          try {
            await pc.setRemoteDescription({ type: 'offer', sdp: payload['sdp'] as string });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsService.send({
              type: 'webrtc.answer',
              payload: { sdp: answer.sdp, type: answer.type },
            });
          } catch (e) {
            console.error('[Call] answer failed', e);
          }
        })();
      }),

      wsService.on('webrtc.answer', (payload) => {
        // We are the caller — set remote description
        const pc = peerConnectionRef.current;
        if (!pc) return;
        void pc.setRemoteDescription({
          type: 'answer',
          sdp: payload['sdp'] as string,
        });
      }),

      wsService.on('webrtc.iceCandidate', (payload) => {
        const pc = peerConnectionRef.current;
        if (!pc || !payload['candidate']) return;
        void pc.addIceCandidate(
          new RTCIceCandidate(payload['candidate'] as object),
        );
      }),
    ];

    return () => subs.forEach((u) => u());
  }, [users, cleanupCall]);

  const buildPeerConnection = useCallback(async (): Promise<
    InstanceType<typeof RTCPeerConnection> | null
  > => {
    let iceServers: { urls: string }[] = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];
    try {
      const cfg = await getConfig();
      iceServers = [
        ...cfg.stunServers.map((s) => ({ urls: s })),
        ...cfg.turnServers,
      ];
    } catch {
      // use default STUN
    }

    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: 'webrtc.iceCandidate',
          payload: { candidate: event.candidate.toJSON() },
        });
      }
    };

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      // addStream was removed in react-native-webrtc v100+; add each track individually
      stream.getTracks().forEach((track) => pc.addTrack(track));
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
      console.error('[CallContext] getUserMedia failed:', msg);
      Alert.alert(
        'Ошибка микрофона',
        `Не удалось получить доступ к микрофону.\n\n${msg}\n\nПроверьте настройки → Приложения → Разрешения.`,
      );
      pc.close();
      return null;
    }

    return pc;
  }, []);

  const makeCall = useCallback(
    async (calleeId: string, calleeName: string) => {
      if (callState !== 'idle') return;
      if (Platform.OS === 'web') {
        Alert.alert('Ошибка', 'Звонки доступны только в мобильном приложении');
        return;
      }
      const granted = await requestMicPermission();
      if (!granted) {
        Alert.alert('Ошибка', 'Необходим доступ к микрофону для звонков');
        return;
      }
      const pc = await buildPeerConnection();
      if (!pc) return;
      peerConnectionRef.current = pc;
      setCallPeer({ id: calleeId, name: calleeName });
      setCallState('calling');
      wsService.send({ type: 'call.invite', payload: { calleeId } });
    },
    [callState, buildPeerConnection],
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    if (Platform.OS === 'web') {
      Alert.alert('Ошибка', 'Звонки доступны только в мобильном приложении');
      return;
    }
    const granted = await requestMicPermission();
    if (!granted) {
      Alert.alert('Ошибка', 'Необходим доступ к микрофону для звонков');
      return;
    }
    const pc = await buildPeerConnection();
    if (!pc) return;
    peerConnectionRef.current = pc;
    setCallPeer({ id: incomingCall.callerId, name: incomingCall.callerName });
    setIncomingCall(null);
    setCallState('in-call');
    setCallStartTime(new Date());
    wsService.send({ type: 'call.accept', payload: {} });
  }, [incomingCall, buildPeerConnection]);

  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    wsService.send({ type: 'call.reject', payload: {} });
    setIncomingCall(null);
  }, [incomingCall]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track: MediaStreamTrackLike) => {
      track.enabled = isMuted;
    });
    setIsMuted((v) => !v);
  }, [isMuted]);

  const insets = useSafeAreaInsets();

  return (
    <CallContext.Provider value={{ callState, callPeer, incomingCall, makeCall, endCall }}>
      {children}

      {/* Incoming call overlay */}
      <Modal visible={incomingCall !== null} animationType="slide" transparent={false}>
        <View style={[callStyles.overlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
          <Text style={callStyles.callLabel}>Входящий звонок</Text>
          <Ionicons name="person-circle" size={96} color="#fff" style={{ marginVertical: 24 }} />
          <Text style={callStyles.peerName}>{incomingCall?.callerName ?? ''}</Text>
          <View style={callStyles.btnRow}>
            <TouchableOpacity style={callStyles.rejectBtn} onPress={rejectCall}>
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={callStyles.btnLabel}>Отклонить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={callStyles.acceptBtn} onPress={() => void acceptCall()}>
              <Ionicons name="call" size={32} color="#fff" />
              <Text style={callStyles.btnLabel}>Принять</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Active call overlay */}
      <Modal
        visible={callState === 'calling' || callState === 'in-call'}
        animationType="slide"
        transparent={false}
      >
        <View style={[callStyles.overlay, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
          <Text style={callStyles.callLabel}>
            {callState === 'calling' ? 'Вызов…' : 'Звонок'}
          </Text>
          <Ionicons name="person-circle" size={96} color="#fff" style={{ marginVertical: 24 }} />
          <Text style={callStyles.peerName}>{callPeer?.name ?? ''}</Text>
          {callState === 'in-call' && callStartTime ? (
            <CallTimer startTime={callStartTime} />
          ) : (
            <Text style={callStyles.timer}>Ожидание ответа…</Text>
          )}
          <View style={callStyles.btnRow}>
            <TouchableOpacity
              style={[callStyles.muteBtn, isMuted && callStyles.muteBtnActive]}
              onPress={toggleMute}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={28} color="#fff" />
              <Text style={callStyles.btnLabel}>{isMuted ? 'Снять' : 'Без звука'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={callStyles.rejectBtn} onPress={endCall}>
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={callStyles.btnLabel}>Завершить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
}

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}

const callStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#1C1C2E',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  callLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 16 },
  peerName: { color: '#fff', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  timer: { color: 'rgba(255,255,255,0.7)', fontSize: 20, marginTop: 8 },
  btnRow: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 48,
    justifyContent: 'center',
    width: '100%',
  },
  acceptBtn: {
    backgroundColor: '#34C759',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  rejectBtn: {
    backgroundColor: '#FF3B30',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  muteBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  muteBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  btnLabel: { color: '#fff', fontSize: 11, textAlign: 'center' },
});
