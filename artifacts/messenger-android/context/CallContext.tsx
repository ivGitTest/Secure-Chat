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

  /** Deterministic avatar color from first char */
  function avatarColor(name: string): string {
    const palette = ['#0044FF', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626'];
    return palette[name.charCodeAt(0) % palette.length];
  }

  function AvatarTile({ name, size = 160 }: { name: string; size?: number }) {
    const br = Math.round(size * 0.244); // ~radius 44 at 180px
    return (
      <View style={{
        width: size, height: size, borderRadius: br,
        backgroundColor: avatarColor(name),
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#0044FF', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35, shadowRadius: 24, elevation: 10,
      }}>
        <Text style={{ color: '#fff', fontSize: size * 0.44, fontWeight: '700', fontFamily: 'Inter_700Bold' }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  }

  return (
    <CallContext.Provider value={{ callState, callPeer, incomingCall, makeCall, endCall }}>
      {children}

      {/* ── Incoming call overlay ── */}
      <Modal visible={incomingCall !== null} animationType="slide" transparent={false}>
        <View style={[callStyles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          {/* Top label */}
          <View style={callStyles.topArea}>
            <Text style={callStyles.callLabel}>ВХОДЯЩИЙ ЗВОНОК</Text>
          </View>

          {/* Center avatar */}
          <View style={callStyles.centerArea}>
            <AvatarTile name={incomingCall?.callerName ?? '?'} size={160} />
            <Text style={callStyles.peerName}>{incomingCall?.callerName ?? ''}</Text>
            <Text style={callStyles.statusText}>Звонит…</Text>
          </View>

          {/* Bottom buttons — thumb zone */}
          <View style={callStyles.bottomArea}>
            <TouchableOpacity style={callStyles.rejectWideBtn} onPress={rejectCall} activeOpacity={0.85}>
              <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={callStyles.wideBtnText}>Отклонить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={callStyles.acceptWideBtn} onPress={() => void acceptCall()} activeOpacity={0.85}>
              <Ionicons name="call" size={26} color="#fff" />
              <Text style={callStyles.wideBtnText}>Принять</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Active / outgoing call overlay ── */}
      <Modal
        visible={callState === 'calling' || callState === 'in-call'}
        animationType="slide"
        transparent={false}
      >
        <View style={[callStyles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          {/* Top: label + timer */}
          <View style={callStyles.topArea}>
            <Text style={callStyles.callLabel}>ГОЛОСОВОЙ ЗВОНОК</Text>
            {callState === 'in-call' && callStartTime ? (
              <CallTimer startTime={callStartTime} />
            ) : (
              <Text style={callStyles.waitingText}>Ожидание ответа…</Text>
            )}
          </View>

          {/* Center avatar */}
          <View style={callStyles.centerArea}>
            <AvatarTile name={callPeer?.name ?? '?'} size={160} />
            <Text style={callStyles.peerName}>{callPeer?.name ?? ''}</Text>
            <Text style={[callStyles.statusText, callState === 'in-call' && callStyles.statusConnected]}>
              {callState === 'in-call' ? 'На связи' : 'Вызов…'}
            </Text>
          </View>

          {/* Bottom controls — thumb zone */}
          <View style={callStyles.bottomArea}>
            {/* Secondary: mute + speaker */}
            <View style={callStyles.secondaryRow}>
              <TouchableOpacity
                style={[callStyles.iconCard, isMuted && callStyles.iconCardMuted]}
                onPress={toggleMute}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic-outline'}
                  size={28}
                  color={isMuted ? C.destructive : C.text}
                />
              </TouchableOpacity>
              <TouchableOpacity style={callStyles.iconCard} activeOpacity={0.8}>
                <Ionicons name="volume-high-outline" size={28} color={C.text} />
              </TouchableOpacity>
            </View>

            {/* End call — wide red button */}
            <TouchableOpacity style={callStyles.endWideBtn} onPress={endCall} activeOpacity={0.85}>
              <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={callStyles.wideBtnText}>Завершить</Text>
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

import colors from '@/constants/colors';
const C = colors.light;

const callStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },

  // ── Zones ──
  topArea: { alignItems: 'center', width: '100%', gap: 6 },
  centerArea: { alignItems: 'center', gap: 16 },
  bottomArea: { width: '100%', gap: 16 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },

  // ── Typography ──
  callLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: C.mutedForeground,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  peerName: {
    fontSize: 32,
    fontWeight: '700',
    color: C.text,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
  },
  statusText: {
    fontSize: 17,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  statusConnected: { color: '#22c55e', fontFamily: 'Inter_700Bold' },
  waitingText: {
    fontSize: 17,
    color: C.mutedForeground,
    fontFamily: 'Inter_400Regular',
  },
  timer: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Inter_700Bold',
  },

  // ── Icon cards (mute / speaker) ──
  iconCard: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  iconCardMuted: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },

  // ── Wide action buttons ──
  acceptWideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 64,
    borderRadius: 20,
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  rejectWideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 64,
    borderRadius: 20,
    backgroundColor: C.destructive,
    shadowColor: C.destructive,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  endWideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 68,
    borderRadius: 24,
    backgroundColor: C.destructive,
    shadowColor: C.destructive,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  wideBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
