/**
 * Firebase Messaging background handler + CallKeep headless wake-up task.
 *
 * This module MUST be imported BEFORE expo-router/entry so that both the
 * Firebase background message handler and the CallKeep headless task are
 * registered before the React Native bridge fully initialises.
 *
 * ── Killed-app call delivery architecture ────────────────────────────────────
 *
 * 1. FCM high-priority data push with `type=call` arrives.
 * 2. `CallFirebaseMessagingService` (injected by `withFirebaseCallService.js`):
 *      a. Clears stale foregroundService key from SharedPreferences to prevent
 *         a NullPointerException in VoiceConnectionService.startForegroundService().
 *      b. Writes call info to getFilesDir()/callkeep_pending.json.
 *      c. Calls TelecomManager.addNewIncomingCall with EXTRA_CALL_UUID +
 *         EXTRA_CALLER_NAME → system lock-screen call UI appears.
 *      d. Starts CallAnswerListenerService (foreground, calls startForeground()
 *         immediately to satisfy Android 8+ background-execution-limit rules)
 *         which registers a LocalBroadcastManager receiver for ACTION_ANSWER_CALL.
 * 3. User taps Accept in the system lock-screen call UI →
 *      VoiceConnectionService.onAnswer() fires ACTION_ANSWER_CALL via
 *      LocalBroadcastManager. CallAnswerListenerService receives it:
 *      a. Sets "answered": true in callkeep_pending.json.
 *      b. Launches MainActivity via FLAG_ACTIVITY_NEW_TASK (allowed because
 *         the service runs in the Telecom-bound process — background-activity-
 *         start exemption on API 29+).
 *      c. Stops itself.
 * 4. CallContext mounts, reads callkeep_pending.json:
 *      a. Sees "answered": true → calls acceptCall(callInfo) directly
 *         (no need to wait for a CallKeep answer event from JS).
 *      b. Alternatively, if VoiceConnectionService delayedEvents replay the
 *         ACTION_ANSWER_CALL broadcast, the onAnswerCall handler calls
 *         acceptCall() and acceptingCallIdRef prevents the double-accept.
 * 5. acceptCall: awaits wsService.waitForConnect() → sends call.accept → SDP.
 *
 * ── Cancellation path ────────────────────────────────────────────────────────
 * For `type=call_cancelled`: CallFirebaseMessagingService calls
 * VoiceConnectionService.getConnection(callId).setDisconnected(MISSED)+destroy(),
 * immediately dismissing the lock-screen call screen, and deletes
 * callkeep_pending.json so the foreground app sees no stale call.
 *
 * ── Non-call message types ───────────────────────────────────────────────────
 * All other types are forwarded to ReactNativeFirebaseMessagingHeadlessService
 * by the native service, so messaging().setBackgroundMessageHandler fires
 * normally for chat pushes and other data events.
 *
 * ── File-based call info persistence ─────────────────────────────────────────
 * Written by CallFirebaseMessagingService:  getFilesDir()/callkeep_pending.json
 * Read/deleted by CallContext (JS):         FileSystem.documentDirectory + PENDING_CALL_FILE
 * Both resolve to:  /data/user/0/<package>/files/callkeep_pending.json
 */
import { AppRegistry, Linking } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { setupCallKeep, onAnswerCall } from './services/callkeepService';

/** Filename under FileSystem.documentDirectory for pending-call persistence. */
export const PENDING_CALL_FILE = 'callkeep_pending.json';

/** Shape of the JSON written by CallFirebaseMessagingService.writePendingCallFile(). */
export interface PendingCallInfo {
  callId: string;
  callerId: string;
  callerName: string;
  arrivedAt: number; // System.currentTimeMillis() — used to expire stale entries
  /** Set to true by CallAnswerListenerService when the user accepts in the system UI. */
  answered?: boolean;
}

// Maximum age in milliseconds after which a pending call is considered stale.
export const PENDING_CALL_MAX_AGE_MS = 60_000;

/**
 * 'RNCallKeepBackgroundMessage' headless task.
 *
 * NOTE: As of the CallAnswerListenerService redesign, this headless task is
 * NO LONGER the primary mechanism for launching MainActivity on answer.
 * CallAnswerListenerService (a foreground service, compliant with Android 8+
 * background-execution limits) now handles that path directly.
 *
 * This task is kept as a secondary layer: if RNCallKeepBackgroundMessagingService
 * is still started by some other code path, it will register react-native-callkeep
 * listeners and open the app on answer via URL scheme. The acceptingCallIdRef
 * guard in CallContext prevents double-acceptance.
 *
 * The task is configured with a 60-second timeout in RNCallKeepBackgroundMessagingService.
 * We resolve after 55 s to stay within budget if the user never answers.
 */
AppRegistry.registerHeadlessTask(
  'RNCallKeepBackgroundMessage',
  () =>
    async (_data: { callUUID?: string; name?: string; handle?: string }) => {
      // Initialise react-native-callkeep so VoiceBroadcastReceiver can relay
      // ACTION_ANSWER_CALL / ACTION_END_CALL to JS.
      await setupCallKeep();

      await new Promise<void>((resolve) => {
        const unsub = onAnswerCall((_callUUID) => {
          unsub();
          // Open the app so MainActivity starts and CallContext mounts.
          // CallContext reads callkeep_pending.json and calls acceptCall().
          // The answerCall UUID is buffered in callkeepService._pendingAnswerUUID
          // and delivered to CallContext's onAnswerCall listener on mount.
          void Linking.openURL('messenger-android://');
          resolve();
        });

        // Resolve on timeout — task must not exceed 60 s (library config).
        setTimeout(() => {
          unsub();
          resolve();
        }, 55_000);
      });
    },
);

messaging().setBackgroundMessageHandler(async (_remoteMessage) => {
  // call / call_cancelled messages are handled entirely by CallFirebaseMessagingService
  // (the native service) and are never forwarded here.
  //
  // Non-call messages (e.g. chat message push data payloads) arrive here and can
  // trigger JS-only work such as local notifications.  Currently this is a no-op
  // because chat message notifications are sent via Expo Push Service as notification
  // messages (which the OS displays automatically without a JS handler).
  //
  // Add non-call handling here if direct-FCM data messages are introduced for
  // other event types in the future.
});
