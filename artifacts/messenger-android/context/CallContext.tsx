/**
 * CallContext — manages voice call state and UI for the family messenger.
 *
 * ── Active / backgrounded app ────────────────────────────────────────────────
 * The WebSocket delivers `call.incoming` with a callId, callerId, callerName.
 * `displayIncomingCall(callId, callerName)` opens the system call screen via
 * react-native-callkeep (Android ConnectionService / Telecom API).
 * When the user taps Accept, the CallKeep answer event triggers `acceptCall()`,
 * which builds a WebRTC peer connection and sends `call.accept` over WS.
 *
 * ── Killed-app flow (native path) ───────────────────────────────────────────
 * 1. FCM high-priority data push arrives. `CallFirebaseMessagingService`
 *    (injected by `withFirebaseCallService` config plugin):
 *    a. clearForegroundServiceSettings() — removes stale callkeep foregroundService
 *       key to prevent NPE in VoiceConnectionService.onCreateIncomingConnection().
 *    b. writePendingCallFile() — serialises callId/callerId/callerName + arrivedAt.
 *    c. TelecomManager.addNewIncomingCall() → system lock-screen call UI.
 *    d. startForegroundService(CallAnswerListenerService) — foreground service
 *       that calls startForeground() immediately (Android 8+ compliant) and
 *       registers a LocalBroadcastManager receiver for ACTION_ANSWER_CALL.
 *
 * 2. User taps Accept in the system call UI →
 *    VoiceConnectionService.onAnswer() fires ACTION_ANSWER_CALL via LocalBroadcast.
 *    CallAnswerListenerService receives it (same process, Telecom-bound):
 *    a. Sets "answered": true in callkeep_pending.json.
 *    b. Launches MainActivity via FLAG_ACTIVITY_NEW_TASK (Telecom exemption).
 *    c. Stops itself.
 *
 * 3. CallContext mounts, reads callkeep_pending.json:
 *    a. answered=true  → auto-calls acceptCall(callInfo) immediately (path A).
 *    b. answered=false → setIncomingCall only; waits for CallKeep delayed-event
 *       replay once RNCallKeepModule registers VoiceBroadcastReceiver (path B).
 *    acceptingCallIdRef prevents double-accept from both paths racing.
 *
 * 4. acceptCall(): NativeModules.MicrophoneCallService.start(callerName) starts
 *    MicrophoneForegroundService (foregroundServiceType=microphone), keeping
 *    microphone accessible when user locks screen / backgrounds app (Android 11+).
 *    Awaits wsService.waitForConnect(10 s) → sends call.accept → SDP negotiation.
 *    On timeout: reportCallEnded dismisses Telecom, deletes file, stops mic service.
 *
 * ── Caller-cancelled / TTL expired ───────────────────────────────────────────
 * `CallFirebaseMessagingService` handles `type="call_cancelled"` natively:
 * VoiceConnectionService.getConnection(callId).setDisconnected(MISSED)+destroy(),
 * dismisses the system call screen, deletes callkeep_pending.json.
 *
 * ── Outgoing call microphone foreground service ───────────────────────────────
 * makeCall() starts MicrophoneForegroundService immediately after buildPeerConnection()
 * acquires the local stream (call is in 'calling' state, user may background).
 * cleanupCall() stops it for all call termination paths.
 *
 * ── Caller-cancelled / TTL expired ───────────────────────────────────────────
 * `CallFirebaseMessagingService` handles `type="call_cancelled"` natively:
 * calls VoiceConnectionService.getConnection(callId).setDisconnected + destroy,
 * dismissing the system call screen. Also deletes callkeep_pending.json.
 */
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
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
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
import {
  displayIncomingCall,
  reportCallEnded,
  reportCallUnanswered,
  endCallKeep,
  onAnswerCall,
  onEndCallKeep,
} from '@/services/callkeepService';
import {
  PENDING_CALL_FILE,
  PENDING_CALL_MAX_AGE_MS,
  type PendingCallInfo,
} from '@/firebase-background-handler';
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

// ── File-based pending call helpers ───────────────────────────────────────────
// The native CallFirebaseMessagingService writes call info to
// getFilesDir()/callkeep_pending.json. expo-file-system maps
// FileSystem.documentDirectory to the same location.

async function readPendingCallFile(): Promise<PendingCallInfo | null> {
  try {
    const uri = FileSystem.documentDirectory + PENDING_CALL_FILE;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as PendingCallInfo;
    if (Date.now() - parsed.arrivedAt > PENDING_CALL_MAX_AGE_MS) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Delete the pending call file only if it belongs to the given callId.
 * This prevents a newer incoming call's file from being removed when an older
 * accept/reject/timeout path finishes cleaning up.
 */
async function deletePendingCallFile(callId: string): Promise<void> {
  try {
    const uri = FileSystem.documentDirectory + PENDING_CALL_FILE;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as PendingCallInfo;
    if (parsed.callId !== callId) return; // different call — do not delete
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

async function requestMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
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
  /**
   * Per-call acceptance guard. Set to the callId as soon as acceptCall starts;
   * cleared when the function finishes (success or error). Prevents the race
   * between the CallKeep answer event and the in-app Accept button from creating
   * duplicate peer connections and sending duplicate call.accept messages.
   * Server-side, call.accept is also idempotent once startedAt is set.
   */
  const acceptingCallIdRef = useRef<string | null>(null);
  /**
   * The server-assigned callId for the currently active call (outgoing or incoming).
   * Distinct from callPeer.id (which is the other user's userId).
   * Required for CallKeep end/report operations that key on the call UUID.
   * Set by call.initiated (outgoing) and acceptCall (incoming); cleared by cleanupCall.
   */
  const activeCallIdRef = useRef<string | null>(null);

  const [callState, setCallState] = useState<CallState>('idle');
  const [callPeer, setCallPeer] = useState<{ id: string; name: string } | null>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallState | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  const cleanupCall = useCallback(() => {
    // Stop the microphone foreground service — must happen before stopping
    // local tracks so Android can gracefully release the microphone resource.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    NativeModules.MicrophoneCallService?.stop();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setCallState('idle');
    setCallPeer(null);
    setCallStartTime(null);
    setIncomingCall(null);
    setIsMuted(false);
    activeCallIdRef.current = null;
    acceptingCallIdRef.current = null;
    // Dismiss the full-screen incoming-call notification posted by
    // CallFirebaseMessagingService so it doesn't linger in the notification drawer
    // after the call is answered, ended, or rejected from the in-app UI.
    void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  }, []);

  const endCall = useCallback(() => {
    // Use the server callId tracked in activeCallIdRef for CallKeep operations.
    // callPeer.id is the other user's userId — not the call UUID.
    const callId = activeCallIdRef.current ?? incomingCall?.callId;
    wsService.send({ type: 'call.end', payload: {} });
    if (callId) endCallKeep(callId);
    cleanupCall();
  }, [cleanupCall, incomingCall]);

  // ── Build WebRTC peer connection ───────────────────────────────────────────
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
      stream.getTracks().forEach((track) => pc.addTrack(track));
    } catch (err: unknown) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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

  // ── Accept an incoming call (called by CallKeep answerCall or in-app button) ──
  const acceptCall = useCallback(async (callInfo: IncomingCallState) => {
    // Per-call acceptance guard: prevents duplicate peer connections and duplicate
    // call.accept messages when the CallKeep answer event and the in-app Accept
    // button both fire for the same call (killed-app cold-start race).
    // The server also ignores duplicate call.accept once startedAt is set.
    if (acceptingCallIdRef.current === callInfo.callId) {
      console.log('[CallContext] acceptCall: already accepting callId', callInfo.callId);
      return;
    }
    acceptingCallIdRef.current = callInfo.callId;

    if (Platform.OS === 'web') {
      acceptingCallIdRef.current = null;
      Alert.alert('Ошибка', 'Звонки доступны только в мобильном приложении');
      return;
    }
    const granted = await requestMicPermission();
    if (!granted) {
      acceptingCallIdRef.current = null;
      Alert.alert('Ошибка', 'Необходим доступ к микрофону для звонков');
      // End the CallKeep connection so the system call UI is dismissed.
      reportCallUnanswered(callInfo.callId);
      void deletePendingCallFile(callInfo.callId);
      return;
    }
    // Start the microphone foreground service BEFORE getUserMedia().
    // On Android 11+ a cold-start process (app woken from killed state by
    // CallAnswerListenerService) may have its mic access revoked by the OS
    // between getUserMedia() and startForeground() unless the foreground
    // service is already active when getUserMedia() is called.
    // Registered by withMicrophoneCallService.js; the optional-chain is a
    // no-op in dev builds before native prebuild.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    NativeModules.MicrophoneCallService?.start(callInfo.callerName);

    const pc = await buildPeerConnection();
    if (!pc) {
      acceptingCallIdRef.current = null;
      // Mic unavailable — tear down the system call screen and discard pending file.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      NativeModules.MicrophoneCallService?.stop();
      reportCallUnanswered(callInfo.callId);
      void deletePendingCallFile(callInfo.callId);
      return;
    }
    peerConnectionRef.current = pc;
    // Store the server callId so endCall / call.end can pass the correct UUID to
    // CallKeep. callPeer.id is the other user's userId — not the call UUID.
    activeCallIdRef.current = callInfo.callId;
    setCallPeer({ id: callInfo.callerId, name: callInfo.callerName });
    setIncomingCall(null);
    setCallState('in-call');
    setCallStartTime(new Date());

    // ── Gate on WS being ready ────────────────────────────────────────────────
    // On a cold-start (app woken by CallKeep from killed state), the WebSocket
    // connection is not yet established when this function fires. Sending
    // call.accept before the socket is OPEN means the message is silently
    // dropped and the caller never receives the signal to create an SDP offer.
    // waitForConnect() waits up to 10 s for authentication to complete first.
    try {
      await wsService.waitForConnect(10_000);
      wsService.send({ type: 'call.accept', payload: {} });
    } catch (err) {
      acceptingCallIdRef.current = null;
      console.error('[CallContext] acceptCall: WS not ready in time', err);
      Alert.alert(
        'Ошибка соединения',
        'Не удалось установить соединение с сервером. Проверьте интернет и попробуйте ещё раз.',
      );
      // Close peer connection and reset UI state.
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      setCallState('idle');
      setCallPeer(null);
      setCallStartTime(null);
      // End the Telecom/CallKeep connection so the system call UI is dismissed.
      // Use callInfo.callId captured in this closure — never incomingCall state
      // (which was already set to null above) to avoid operating on a stale or
      // different call's UUID.
      reportCallEnded(callInfo.callId);
      // Delete the pending file only for this specific call, not a newer one.
      void deletePendingCallFile(callInfo.callId);
      return;
    }

    // Success: guard cleared — a future call on this device can now be accepted.
    acceptingCallIdRef.current = null;
    // Delete the pending call file (no longer needed after call.accept sent).
    void deletePendingCallFile(callInfo.callId);
  }, [buildPeerConnection]);

  const rejectCall = useCallback((callId?: string) => {
    wsService.send({ type: 'call.reject', payload: {} });
    if (callId) reportCallUnanswered(callId);
    setIncomingCall(null);
    // Delete the pending call file only for this specific call.
    if (callId) void deletePendingCallFile(callId);
    // Dismiss the full-screen incoming-call notification (posted by the Java service).
    void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  }, []);

  // ── WS event subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const subs = [
      // ── Incoming call from WS ──────────────────────────────────────────────
      wsService.on('call.incoming', (payload) => {
        const callId = payload['callId'] as string;
        const callerId = payload['callerId'] as string;
        const caller = users.find((u) => u.id === callerId);
        const callerName = caller?.name ?? callerId;
        const callInfo: IncomingCallState = { callId, callerId, callerName };

        setIncomingCall(callInfo);

        // Only call displayIncomingCall() if the native FCM path hasn't already
        // done it.  The server now sends FCM only when the callee is offline/killed
        // (no active WS connection), so in the normal foreground/background case
        // this WS event is the sole trigger and displayIncomingCall() should always
        // run.  The pending-file check is kept as a safety net: if for any reason
        // CallFirebaseMessagingService already wrote the file (e.g. race on reconnect),
        // we skip the duplicate call to avoid two concurrent system call screens.
        void readPendingCallFile().then((pending) => {
          if (pending?.callId === callId) {
            // Native FCM path already showed the system call screen — skip.
            return;
          }
          // Normal path: app is in foreground/background with active WS — show call UI.
          displayIncomingCall(callId, callerName);
        });
      }),

      // ── Caller accepted our call (we are the caller) ───────────────────────
      wsService.on('call.accept', () => {
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
        // Remote party ended the call — dismiss CallKeep UI using the server callId.
        // activeCallIdRef tracks the correct UUID regardless of who is caller/callee.
        const callId = activeCallIdRef.current ?? incomingCall?.callId;
        if (callId) reportCallEnded(callId);
        cleanupCall();
      }),

      wsService.on('call.initiated', (payload) => {
        // Server echoes the generated callId back to the caller after call.invite.
        // Store it so endCall can pass the correct UUID to CallKeep when the caller
        // ends the call (callPeer.id is the callee userId, not the call UUID).
        const callId = payload['callId'] as string | undefined;
        if (callId) activeCallIdRef.current = callId;
      }),

      wsService.on('webrtc.offer', (payload) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, cleanupCall]);

  // ── CallKeep event subscriptions ──────────────────────────────────────────
  useEffect(() => {
    // When the user taps "Accept" in the system call UI
    const unsubAnswer = onAnswerCall((_callUUID) => {
      if (incomingCall) {
        void acceptCall(incomingCall);
        return;
      }
      // App was killed — read call info from the file written by CallFirebaseMessagingService
      void (async () => {
        try {
          const info = await readPendingCallFile();
          if (!info) return;
          const callInfo: IncomingCallState = {
            callId: info.callId,
            callerId: info.callerId,
            callerName: info.callerName,
          };
          setIncomingCall(callInfo);
          // Build peer connection and accept — WS will connect in the background
          await acceptCall(callInfo);
        } catch (err) {
          console.warn('[CallContext] answerCall from pending call file failed:', err);
        }
      })();
    });

    // When the user taps "Decline" or "End call" in the system call UI
    const unsubEnd = onEndCallKeep((callUUID) => {
      if (callState === 'in-call') {
        // Active call ended via the system CallKeep UI (e.g. user pressed End from
        // the lock screen or ongoing-call notification).
        // Must explicitly report the call as ended to Telecom — cleanupCall alone
        // does not dismiss the native connection, leaving a stuck system call UI.
        const activeId = activeCallIdRef.current ?? callUUID;
        reportCallEnded(activeId);
        wsService.send({ type: 'call.end', payload: {} });
        cleanupCall();
      } else {
        // Incoming call declined before answering
        rejectCall(callUUID);
      }
    });

    return () => {
      unsubAnswer();
      unsubEnd();
    };
  // Re-subscribe when incomingCall / callState changes so callbacks capture fresh state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingCall, callState, acceptCall, rejectCall, cleanupCall]);

  // ── Check for a pending call on first mount ──────────────────────────────
  // Covers two killed-app scenarios:
  //
  // A) "answered" path: CallAnswerListenerService set "answered": true in the
  //    file before launching MainActivity. We auto-accept immediately without
  //    waiting for the CallKeep answer event (which requires the RN bridge to
  //    have been alive when onAnswer fired — it wasn't).
  //    acceptingCallIdRef prevents a double-accept if the delayedEvents
  //    mechanism also replays ACTION_ANSWER_CALL after the bridge initialises.
  //
  // B) "pending" path: app was woken by the CallKeep answer event BEFORE this
  //    effect ran (e.g. app was backgrounded, not killed). Restore incomingCall
  //    state so the onAnswerCall handler above can call acceptCall().
  useEffect(() => {
    void (async () => {
      try {
        const info = await readPendingCallFile();
        if (!info) return;
        const callInfo: IncomingCallState = {
          callId: info.callId,
          callerId: info.callerId,
          callerName: info.callerName,
        };
        setIncomingCall(callInfo);

        if (info.answered) {
          // Path A: user already accepted in system UI — auto-accept without
          // showing the in-app modal or waiting for a CallKeep event.
          await acceptCall(callInfo);
        }
      } catch {
        // ignore parse errors
      }
    })();
  // acceptCall is stable (useCallback with stable deps); include it so lint
  // doesn't warn, but this effect intentionally runs only once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

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
      // Start microphone foreground service BEFORE getUserMedia() — same reasoning
      // as in acceptCall(): Android 11+ requires the service to be active first.
      // cleanupCall() stops it on all termination paths.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      NativeModules.MicrophoneCallService?.start(calleeName);

      const pc = await buildPeerConnection();
      if (!pc) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        NativeModules.MicrophoneCallService?.stop();
        return;
      }
      peerConnectionRef.current = pc;

      setCallPeer({ id: calleeId, name: calleeName });
      setCallState('calling');
      wsService.send({ type: 'call.invite', payload: { calleeId } });
    },
    [callState, buildPeerConnection],
  );

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track: MediaStreamTrackLike) => {
      track.enabled = isMuted;
    });
    setIsMuted((v) => !v);
  }, [isMuted]);

  const insets = useSafeAreaInsets();

  function avatarColor(name: string): string {
    const palette = ['#0044FF', '#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626'];
    return palette[name.charCodeAt(0) % palette.length];
  }

  function AvatarTile({ name, size = 160 }: { name: string; size?: number }) {
    const br = Math.round(size * 0.244);
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

  // Show in-app incoming call screen when:
  //   • app is in foreground and WS delivers call.incoming (displayIncomingCall() is NOT called)
  //   • app opens from the full-screen notification tap (pending file unread, answered=false)
  // NOT shown when the system call screen answered path fires (pending file answered=true →
  // acceptCall() is called directly and setIncomingCall stays null).
  const showIncomingModal = incomingCall !== null && callState === 'idle';

  return (
    <CallContext.Provider value={{ callState, callPeer, incomingCall, makeCall, endCall }}>
      {children}

      {/* ── Incoming call screen ─────────────────────────────────────────────
          Primary UI for ALL incoming calls. The system call screen (CallKeep /
          TelecomManager) may also appear on phones where the calling account is
          enabled, but this Modal is always the authoritative in-app view.
          No displayIncomingCall() is called from the WS handler, so this Modal
          is the only in-app layer — no duplicate windows.                    */}
      <Modal visible={showIncomingModal} animationType="slide" transparent={false}>
        <View style={[callStyles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          <View style={callStyles.topArea}>
            <Text style={callStyles.callLabel}>ВХОДЯЩИЙ ЗВОНОК</Text>
          </View>
          <View style={callStyles.centerArea}>
            <AvatarTile name={incomingCall?.callerName ?? '?'} size={160} />
            <Text style={callStyles.peerName}>{incomingCall?.callerName ?? ''}</Text>
            <Text style={callStyles.statusText}>Звонит…</Text>
          </View>
          <View style={callStyles.bottomArea}>
            <TouchableOpacity
              style={callStyles.rejectWideBtn}
              onPress={() => rejectCall(incomingCall?.callId)}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={callStyles.wideBtnText}>Отклонить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={callStyles.acceptWideBtn}
              onPress={() => incomingCall && void acceptCall(incomingCall)}
              activeOpacity={0.85}
            >
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
          <View style={callStyles.topArea}>
            <Text style={callStyles.callLabel}>ГОЛОСОВОЙ ЗВОНОК</Text>
            {callState === 'in-call' && callStartTime ? (
              <CallTimer startTime={callStartTime} />
            ) : (
              <Text style={callStyles.waitingText}>Ожидание ответа…</Text>
            )}
          </View>
          <View style={callStyles.centerArea}>
            <AvatarTile name={callPeer?.name ?? '?'} size={160} />
            <Text style={callStyles.peerName}>{callPeer?.name ?? ''}</Text>
            <Text style={[callStyles.statusText, callState === 'in-call' && callStyles.statusConnected]}>
              {callState === 'in-call' ? 'На связи' : 'Вызов…'}
            </Text>
          </View>
          <View style={callStyles.bottomArea}>
            <View style={callStyles.secondaryRow}>
              <TouchableOpacity
                style={[callStyles.iconCard, isMuted && callStyles.iconCardMuted]}
                onPress={toggleMute}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic-outline'}
                  size={28}
                  color={isMuted ? '#fca5a5' : '#FFFFFF'}
                />
              </TouchableOpacity>
              <TouchableOpacity style={callStyles.iconCard} activeOpacity={0.8}>
                <Ionicons name="volume-high-outline" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
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
    backgroundColor: C.callBg,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  topArea: { alignItems: 'center', width: '100%', gap: 8 },
  centerArea: { alignItems: 'center', gap: 20 },
  bottomArea: { width: '100%', gap: 20 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  callLabel: {
    fontSize: 13, fontWeight: '700', letterSpacing: 2,
    color: '#71717a', fontFamily: 'Inter_700Bold', textTransform: 'uppercase',
  },
  peerName: {
    fontSize: 48, fontWeight: '700', color: '#FFFFFF',
    textAlign: 'center', letterSpacing: -1, fontFamily: 'Inter_700Bold',
  },
  statusText: { fontSize: 17, color: '#71717a', fontFamily: 'Inter_400Regular' },
  statusConnected: { color: C.accept, fontFamily: 'Inter_700Bold' },
  waitingText: { fontSize: 17, color: '#71717a', fontFamily: 'Inter_400Regular' },
  timer: {
    fontSize: 32, fontWeight: '700', color: '#FFFFFF',
    fontVariant: ['tabular-nums'], fontFamily: 'Inter_700Bold',
  },
  iconCard: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: C.callSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  iconCardMuted: { backgroundColor: `${C.reject}33` },
  acceptWideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, minHeight: 72, borderRadius: 20,
    backgroundColor: C.accept, paddingHorizontal: 32,
  },
  rejectWideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, minHeight: 72, borderRadius: 20,
    backgroundColor: C.reject, paddingHorizontal: 32,
  },
  endWideBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, minHeight: 72, borderRadius: 20,
    backgroundColor: C.reject, paddingHorizontal: 32,
  },
  wideBtnText: {
    fontSize: 18, fontWeight: '700', color: '#FFFFFF', fontFamily: 'Inter_700Bold',
  },
});
