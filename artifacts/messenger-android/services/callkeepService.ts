/**
 * CallKeep service — wraps react-native-callkeep for VoIP call UI.
 *
 * Responsibilities:
 *  - Initialize ConnectionService with Android Telecom API
 *  - Show / dismiss the native incoming-call screen
 *  - Buffer answerCall / endCall events that fire before CallContext is mounted
 *  - Provide clean subscribe/unsubscribe helpers for CallContext
 *
 * Call setupCallKeep() once at app startup (in _layout.tsx useEffect).
 * Import this module as early as possible so the event listeners are
 * registered before any CallKeep events can fire.
 */
import { Platform } from 'react-native';
import RNCallKeep, { CONSTANTS as CallKeepConstants } from 'react-native-callkeep';

let _initialized = false;
let _pendingAnswerUUID: string | null = null;

type UUIDCallback = (callUUID: string) => void;
let _answerListeners: UUIDCallback[] = [];
let _endListeners: UUIDCallback[] = [];

// ─── Setup ────────────────────────────────────────────────────────────────────

/**
 * Initialize CallKeep and register event listeners.
 * Idempotent — safe to call more than once.
 * Must be called before any incoming call can arrive.
 */
export async function setupCallKeep(): Promise<void> {
  if (_initialized || Platform.OS !== 'android') return;
  _initialized = true;

  try {
    await RNCallKeep.setup({
      ios: { appName: 'Семейный мессенджер' }, // unused on Android
      android: {
        alertTitle: 'Доступ к телефонным звонкам',
        alertDescription: 'Необходим для отображения входящих голосовых звонков',
        cancelButton: 'Отмена',
        okButton: 'Разрешить',
        imageName: 'phone_account_icon',
        additionalPermissions: [],
        selfManaged: false,
        // NOTE: foregroundService config is intentionally omitted.
        // VoiceConnectionService.onCreateIncomingConnection() reads settings from
        // SharedPreferences via this.getSettings(this) and then calls
        // startForegroundService(). If settings contain a `foregroundService.channelId`
        // key (stored from a previous setup() call), isForegroundServiceConfigured()
        // returns true and startForegroundService() dereferences
        // RNCallKeepModule.instance.getCurrentReactActivity() — which is null in a
        // killed-app headless process, causing a NullPointerException.
        // Without foregroundService config, isForegroundServiceConfigured() always
        // returns false and the dangerous path is never reached.
      },
    });

    RNCallKeep.setAvailable(true);

    // ── answerCall ──────────────────────────────────────────────────────────
    RNCallKeep.addEventListener(
      'answerCall',
      ({ callUUID }: { callUUID: string }) => {
        if (_answerListeners.length > 0) {
          _answerListeners.forEach((cb) => cb(callUUID));
        } else {
          // Buffer — CallContext hasn't mounted yet (app was just started)
          _pendingAnswerUUID = callUUID;
        }
      },
    );

    // ── endCall / declineCall ───────────────────────────────────────────────
    RNCallKeep.addEventListener(
      'endCall',
      ({ callUUID }: { callUUID: string }) => {
        _endListeners.forEach((cb) => cb(callUUID));
      },
    );

    // ── didLoadWithEvents ───────────────────────────────────────────────────
    // Fires on app start if CallKeep events arrived while JS wasn't ready
    // (e.g. user answered/declined before the React tree mounted).
    // didLoadWithEvents fires on app start if CallKeep events arrived while JS wasn't ready.
    // The InitialEvents type uses a discriminated union, so we need a looser cast.
    RNCallKeep.addEventListener(
      'didLoadWithEvents',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (events: any) => {
        if (!Array.isArray(events)) return;
        for (const event of events as Array<{ name: string; data?: Record<string, unknown> }>) {
          if (
            event.name === 'RNCallKeepPerformAnswerCallAction' &&
            typeof event.data?.['callUUID'] === 'string'
          ) {
            const uuid = event.data['callUUID'] as string;
            if (_answerListeners.length > 0) {
              _answerListeners.forEach((cb) => cb(uuid));
            } else {
              _pendingAnswerUUID = uuid;
            }
          } else if (
            event.name === 'RNCallKeepPerformEndCallAction' &&
            typeof event.data?.['callUUID'] === 'string'
          ) {
            const uuid = event.data['callUUID'] as string;
            _endListeners.forEach((cb) => cb(uuid));
          }
        }
      },
    );

    console.log('[CallKeep] initialized');
  } catch (err) {
    console.warn('[CallKeep] setup failed:', err);
    _initialized = false; // allow retry on next app start
  }
}

// ─── Display / dismiss ────────────────────────────────────────────────────────

/**
 * Show the system incoming-call screen.
 * @param callUUID  Server-generated call UUID (used to link WS events → CallKeep)
 * @param callerName  Display name for the caller
 */
export function displayIncomingCall(callUUID: string, callerName: string): void {
  if (!_initialized) {
    console.warn('[CallKeep] displayIncomingCall called before setup');
    return;
  }
  try {
    RNCallKeep.displayIncomingCall(callUUID, callerName, callerName, 'generic', false);
  } catch (err) {
    console.warn('[CallKeep] displayIncomingCall error:', err);
  }
}

/** Dismiss the system UI (normal end — remote party ended the call). */
export function reportCallEnded(callUUID: string): void {
  if (!_initialized) return;
  try {
    // REMOTE_ENDED = 2 per CallKeepConstants.END_CALL_REASONS
    RNCallKeep.reportEndCallWithUUID(
      callUUID,
      CallKeepConstants.END_CALL_REASONS.REMOTE_ENDED,
    );
  } catch (err) {
    console.warn('[CallKeep] reportCallEnded error:', err);
  }
}

/** Dismiss the system UI (unanswered / caller cancelled). */
export function reportCallUnanswered(callUUID: string): void {
  if (!_initialized) return;
  try {
    // UNANSWERED = 3 per CallKeepConstants.END_CALL_REASONS
    RNCallKeep.reportEndCallWithUUID(
      callUUID,
      CallKeepConstants.END_CALL_REASONS.UNANSWERED,
    );
  } catch (err) {
    console.warn('[CallKeep] reportCallUnanswered error:', err);
  }
}

/** End an active call in the system UI (we ended it locally). */
export function endCallKeep(callUUID: string): void {
  if (!_initialized) return;
  try {
    RNCallKeep.endCall(callUUID);
  } catch (err) {
    console.warn('[CallKeep] endCall error:', err);
  }
}

// ─── Event subscriptions (used by CallContext) ────────────────────────────────

/**
 * Subscribe to CallKeep's "user answered" event.
 * If an answer event was buffered (app was killed and restarted), the callback
 * fires immediately with the buffered UUID.
 */
export function onAnswerCall(cb: UUIDCallback): () => void {
  _answerListeners.push(cb);
  // Deliver buffered answer immediately if it exists
  if (_pendingAnswerUUID) {
    const uuid = _pendingAnswerUUID;
    _pendingAnswerUUID = null;
    cb(uuid);
  }
  return () => {
    _answerListeners = _answerListeners.filter((c) => c !== cb);
  };
}

/** Subscribe to CallKeep's "user ended/declined" event. */
export function onEndCallKeep(cb: UUIDCallback): () => void {
  _endListeners.push(cb);
  return () => {
    _endListeners = _endListeners.filter((c) => c !== cb);
  };
}

export function isInitialized(): boolean {
  return _initialized;
}
