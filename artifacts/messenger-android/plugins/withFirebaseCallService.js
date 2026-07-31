/**
 * Expo config plugin: native Android Firebase messaging service for call notifications.
 *
 * ── Why this plugin exists ────────────────────────────────────────────────────
 *
 * react-native-callkeep's `displayIncomingCall` / JS-side `setup` require a
 * PhoneAccountHandle that is created by `RNCallKeepModule.registerPhoneAccount()`.
 * That method checks `reactContext.getCurrentActivity()`, which is null in a
 * headless process (app killed, FCM woke a new process). As a result, the static
 * `RNCallKeepModule.handle` field is never set and all CallKeep JS calls are no-ops.
 *
 * ── Single-authoritative-service design ──────────────────────────────────────
 *
 * Android delivers `com.google.firebase.MESSAGING_EVENT` to ONE service. This
 * plugin registers `CallFirebaseMessagingService` at `android:priority="1"`,
 * making it the single authoritative handler for ALL FCM data messages.
 *
 * In `onMessageReceived`, the service:
 *
 *  type="call" →
 *    1. Builds PhoneAccountHandle from ApplicationContext (no Activity needed).
 *    2. Registers CAPABILITY_CALL_PROVIDER PhoneAccount via TelecomManager.
 *    3. Primes `VoiceConnectionService.setPhoneAccountHandle(handle)` so
 *       JS-side `reportEndCallWithUUID` / `endCall` work on the next launch.
 *    4. Puts exact VoiceConnectionService bundle keys:
 *         "EXTRA_CALL_UUID"   – connection indexed by server callId
 *         "EXTRA_CALLER_NAME" – shown in the system lock-screen call UI
 *    5. Calls `TelecomManager.addNewIncomingCall(handle, extras)`.
 *    6. Writes call info as JSON to `getFilesDir()/callkeep_pending.json`
 *       (the same path expo-file-system sees as FileSystem.documentDirectory).
 *       JS reads this file on mount to restore state after the user taps Accept.
 *
 *  type="call_cancelled" →
 *    1. Calls `VoiceConnectionService.getConnection(callId)` from the public
 *       static `currentConnections` map.
 *    2. `connection.setDisconnected(DisconnectCause.MISSED)` + `destroy()` —
 *       dismisses the system call screen immediately.
 *    3. Deletes `callkeep_pending.json` so the foreground app doesn't try to
 *       resume a call that no longer exists.
 *
 *  all other types →
 *    Forwarded to `ReactNativeFirebaseMessagingHeadlessService` when the app is
 *    not in the foreground, so the JS `setBackgroundMessageHandler` fires as
 *    usual for message-push and other non-call events.
 *
 * ── File-based call info persistence ─────────────────────────────────────────
 *
 * Because the killed-app flow wakes two separate processes at different times
 * (1. this native service; 2. the React Native JS process after the user taps
 * Accept), we persist call info via a plain JSON file in the app's files
 * directory rather than AsyncStorage. AsyncStorage is part of the JS/RN layer
 * and is not writable from native Java without a custom bridge module.
 * `getFilesDir()` is always available in a Service context.
 *
 * Path written by native service (Java):
 *   context.getFilesDir() + "/callkeep_pending.json"
 * Path read by JS (expo-file-system):
 *   FileSystem.documentDirectory + "callkeep_pending.json"
 * Both resolve to the same location on Android.
 */

const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

/** Must match app.json android.package */
const PACKAGE_NAME = 'com.ivaexpi.messengerandroid';

const JAVA_SOURCE = `\
package ${PACKAGE_NAME};

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.Connection;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import com.facebook.react.HeadlessJsTaskService;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import io.invertase.firebase.common.SharedUtils;
import io.wazo.callkeep.VoiceConnectionService;

/**
 * Single-authoritative FirebaseMessagingService for call notifications.
 *
 * Sole FirebaseMessagingService registered for com.google.firebase.MESSAGING_EVENT
 * (ReactNativeFirebaseMessagingService is removed from the manifest by the config
 * plugin so there is no competing service). Responsibilities:
 *
 *   - type=call        : register PhoneAccount, call TelecomManager.addNewIncomingCall,
 *                        write call info JSON to getFilesDir() for JS recovery.
 *   - type=call_cancelled : terminate live VoiceConnection, delete pending JSON file.
 *   - other types      : forward to ReactNativeFirebaseMessagingHeadlessService so
 *                        the JS setBackgroundMessageHandler still fires (e.g. for
 *                        message-push notifications).
 */
public class CallFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "CallFMS";

    // Exact string values from io.wazo.callkeep.Constants — copied here to avoid
    // a compile-time dependency on internal callkeep constants.
    private static final String EXTRA_CALL_UUID    = "EXTRA_CALL_UUID";
    private static final String EXTRA_CALLER_NAME  = "EXTRA_CALLER_NAME";
    private static final String ACTION_ANSWER_CALL = "ACTION_ANSWER_CALL";
    private static final String ACTION_END_CALL    = "ACTION_END_CALL";

    /** Filename inside getFilesDir() for pending-call persistence. */
    static final String PENDING_CALL_FILE = "callkeep_pending.json";

    // Holds the pre-answer receiver so it can be cleaned up deterministically
    // from handleCallCancelled() and from the auto-unregister TTL handler.
    // Volatile: written on the Firebase worker thread, read on the main thread.
    private static volatile BroadcastReceiver sPreAnswerReceiver;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");

        if ("call".equals(type)) {
            handleIncomingCall(data);
            // Do NOT forward to headless service — native path is authoritative for calls.
            return;
        }

        if ("call_cancelled".equals(type)) {
            handleCallCancelled(data);
            // Do NOT forward — native dismissal is complete.
            return;
        }

        // All other data messages (e.g. message-push data payloads) are forwarded to
        // the RNFirebase HeadlessService so JS setBackgroundMessageHandler still runs.
        forwardToHeadlessService(remoteMessage);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Incoming call
    // ──────────────────────────────────────────────────────────────────────────

    private void handleIncomingCall(Map<String, String> data) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Log.w(TAG, "ConnectionService requires Android 6.0 (API 23)+");
            return;
        }

        String callId    = data.get("callId");
        String callerId  = data.get("callerId");
        String callerName = data.get("callerName");
        if (callerName == null || callerName.isEmpty()) callerName = callerId;

        if (callId == null || callerId == null) {
            Log.w(TAG, "handleIncomingCall: missing callId or callerId in FCM data");
            return;
        }

        try {
            // Build PhoneAccountHandle from ApplicationContext.
            // ApplicationContext is always available even in a headless process where
            // there is no Activity.  The appName MUST match what react-native-callkeep
            // uses in registerPhoneAccount() so the same TelecomManager account is found.
            String appName = getApplicationInfo().loadLabel(getPackageManager()).toString();
            ComponentName cName = new ComponentName(
                    getApplicationContext(), VoiceConnectionService.class);
            PhoneAccountHandle handle = new PhoneAccountHandle(cName, appName);

            TelecomManager tm = (TelecomManager) getSystemService(TELECOM_SERVICE);
            if (tm == null) {
                Log.e(TAG, "TelecomManager unavailable");
                return;
            }

            // Register the PhoneAccount if not yet registered.
            // Normally registered by react-native-callkeep on first foreground launch and
            // persists across app kills. This block is a safety net for fresh installs or
            // accounts that were cleared.
            PhoneAccount existing = tm.getPhoneAccount(handle);
            if (existing == null || !existing.isEnabled()) {
                PhoneAccount account = PhoneAccount.builder(handle, appName)
                        .setCapabilities(PhoneAccount.CAPABILITY_CALL_PROVIDER)
                        .build();
                tm.registerPhoneAccount(account);
                Log.d(TAG, "PhoneAccount registered from native service");
            }

            // Prime the react-native-callkeep static PhoneAccountHandle so JS-side
            // reportEndCallWithUUID and endCall resolve the same account when the
            // foreground app starts after the user taps Accept.
            VoiceConnectionService.setPhoneAccountHandle(handle);

            // Pass the exact bundle keys VoiceConnectionService reads in
            // onCreateIncomingConnection. Using any other key names will result in
            // the connection being stored under a null UUID and caller name.
            Bundle extras = new Bundle();
            extras.putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS,
                    Uri.fromParts(PhoneAccount.SCHEME_TEL, callerId, null));
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);
            extras.putString(EXTRA_CALL_UUID,   callId);       // VoiceConnectionService key
            extras.putString(EXTRA_CALLER_NAME, callerName);   // VoiceConnectionService key

            // Remove any stale foregroundService key from CallKeep's SharedPreferences
            // BEFORE dispatching Telecom. VoiceConnectionService.onCreateIncomingConnection()
            // reads those settings and calls startForegroundService(); a leftover
            // channelId from a previous build would make isForegroundServiceConfigured()
            // return true, causing a NullPointerException when it dereferences
            // RNCallKeepModule.instance (null in a killed-app process) at line 322.
            clearForegroundServiceSettings();

            // Persist call info BEFORE dispatching Telecom so that if the OS
            // starts the app immediately after addNewIncomingCall (e.g. when the
            // system call screen starts the app in the background to wake it up),
            // CallContext.readPendingCallFile() already finds the file.
            // If addNewIncomingCall throws, the catch block below deletes the file.
            writePendingCallFile(callId, callerId, callerName);

            // ── Race-free pre-answer receiver ─────────────────────────────────
            // Registered synchronously (LocalBroadcastManager.registerReceiver is
            // thread-safe) BEFORE addNewIncomingCall() so it is guaranteed to exist
            // when the Telecom system call screen first appears.  This eliminates the
            // window between addNewIncomingCall() and CallAnswerListenerService
            // completing its asynchronous ActivityManager bind/start round-trip.
            //
            // Lifecycle cleanup contract:
            //   A) OnReceive fires first   — unregisters itself.
            //   B) handleCallCancelled()   — unregisters via sPreAnswerReceiver.
            //   C) 65-second TTL handler   — unregisters if still the same instance.
            // In all three paths sPreAnswerReceiver is nulled after unregistration.
            final Context appCtx = getApplicationContext();
            final String  preAnswerCallId  = callId;
            // AtomicBoolean prevents double-firing when a Telecom state machine sends
            // ACTION_END_CALL as part of the answer transition on some vendor ROMs,
            // potentially racing with ACTION_ANSWER_CALL in the main-thread queue.
            final AtomicBoolean answeredOnce = new AtomicBoolean(false);

            final BroadcastReceiver preAnswerRcvr = new BroadcastReceiver() {
                /** Unregister this receiver and null the static reference. */
                void release() {
                    try {
                        LocalBroadcastManager.getInstance(appCtx)
                                .unregisterReceiver(this);
                    } catch (Exception ignored) {}
                    // Only null sPreAnswerReceiver if it still points to this instance
                    // (a new call could have replaced it).
                    //noinspection SynchronizeOnNonFinalField
                    if (sPreAnswerReceiver == this) sPreAnswerReceiver = null;
                }

                @Override
                public void onReceive(Context ctx, Intent rcvIntent) {
                    // UUID guard: ignore if the pending file now belongs to a different
                    // call (possible if a second call arrived after cancellation).
                    try {
                        File f = new File(appCtx.getFilesDir(), PENDING_CALL_FILE);
                        if (f.exists()) {
                            StringBuilder sb = new StringBuilder();
                            try (BufferedReader br =
                                     new BufferedReader(new FileReader(f))) {
                                String ln;
                                while ((ln = br.readLine()) != null) sb.append(ln);
                            }
                            String currentId =
                                    new JSONObject(sb.toString()).optString("callId");
                            if (!preAnswerCallId.equals(currentId)) {
                                Log.d(TAG, "preAnswerRcvr: stale callId, releasing");
                                release();
                                return;
                            }
                        }
                    } catch (Exception e) {
                        Log.d(TAG, "preAnswerRcvr: UUID check failed: "
                                + e.getMessage());
                    }

                    if (ACTION_ANSWER_CALL.equals(rcvIntent.getAction())) {
                        // CAS ensures exactly-once even if END_CALL is queued
                        // immediately after ANSWER_CALL on some Telecom implementations.
                        if (answeredOnce.compareAndSet(false, true)) {
                            release();
                            // Mark the pending file answered so CallContext auto-accepts.
                            try {
                                File f = new File(appCtx.getFilesDir(), PENDING_CALL_FILE);
                                if (f.exists()) {
                                    StringBuilder sb = new StringBuilder();
                                    try (BufferedReader br =
                                             new BufferedReader(new FileReader(f))) {
                                        String ln;
                                        while ((ln = br.readLine()) != null)
                                            sb.append(ln);
                                    }
                                    JSONObject j = new JSONObject(sb.toString());
                                    j.put("answered", true);
                                    try (FileWriter fw = new FileWriter(f, false)) {
                                        fw.write(j.toString());
                                    }
                                }
                            } catch (Exception e) {
                                Log.w(TAG, "preAnswerRcvr: markAnswered failed: "
                                        + e.getMessage());
                            }
                            // Launch MainActivity — Telecom binding grants background-
                            // activity-start exemption on API 29+.
                            try {
                                Intent launch = appCtx.getPackageManager()
                                        .getLaunchIntentForPackage(
                                                appCtx.getPackageName());
                                if (launch != null) {
                                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                                    appCtx.startActivity(launch);
                                    Log.d(TAG, "preAnswerRcvr: launched MainActivity");
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "preAnswerRcvr: launch failed: "
                                        + e.getMessage(), e);
                            }
                        }
                    } else if (ACTION_END_CALL.equals(rcvIntent.getAction())) {
                        // Decline / remote cancellation path.  Only release if we have
                        // not handled an answer — an END_CALL can arrive as a Telecom
                        // state-transition side-effect right after the answer on some
                        // vendor ROMs; silently ignore it in that case.
                        if (!answeredOnce.get()) {
                            release();
                        }
                    }
                }
            };
            sPreAnswerReceiver = preAnswerRcvr;

            // TTL auto-release: unregister after call TTL (60 s) + buffer.
            // Covers call-timeout and caller-cancel paths where no LocalBroadcast fires
            // (e.g. caller hangs up before VoiceConnectionService creates a connection).
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                BroadcastReceiver r = sPreAnswerReceiver;
                if (r == preAnswerRcvr) {
                    try {
                        LocalBroadcastManager.getInstance(appCtx)
                                .unregisterReceiver(r);
                    } catch (Exception ignored) {}
                    sPreAnswerReceiver = null;
                    Log.d(TAG, "preAnswerRcvr: TTL expired, released");
                }
            }, 65_000);

            IntentFilter preAnswerFilter = new IntentFilter();
            preAnswerFilter.addAction(ACTION_ANSWER_CALL);
            preAnswerFilter.addAction(ACTION_END_CALL);
            LocalBroadcastManager.getInstance(appCtx)
                    .registerReceiver(preAnswerRcvr, preAnswerFilter);

            tm.addNewIncomingCall(handle, extras);
            Log.d(TAG, "addNewIncomingCall dispatched callId=" + callId
                    + " callerName=" + callerName);

            // Start CallAnswerListenerService to detect when the user taps Accept in the
            // system lock-screen call UI and launch MainActivity at that moment.
            //
            // Uses startForegroundService() on API 26+ (Android 8+) to bypass background
            // execution limits. The service MUST call startForeground() within 5 s or the
            // OS terminates it with an ANR. CallAnswerListenerService does so immediately
            // in onStartCommand(). On older API levels, startService() is sufficient.
            Intent listenerIntent = new Intent(
                    getApplicationContext(), CallAnswerListenerService.class);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getApplicationContext().startForegroundService(listenerIntent);
                } else {
                    getApplicationContext().startService(listenerIntent);
                }
                Log.d(TAG, "CallAnswerListenerService started");
            } catch (Exception e) {
                Log.w(TAG, "Failed to start CallAnswerListenerService: " + e.getMessage());
            }

        } catch (SecurityException e) {
            // CALL_PHONE not yet granted — happens only on very first install before
            // any foreground launch. The call will time out after server TTL (60 s).
            Log.w(TAG, "SecurityException: CALL_PHONE not granted yet: " + e.getMessage());
            deletePendingCallFile(); // clean up file written before dispatch attempt
        } catch (Exception e) {
            Log.e(TAG, "handleIncomingCall failed: " + e.getMessage(), e);
            deletePendingCallFile(); // clean up file written before dispatch attempt
        }
    }

    /**
     * Remove the {@code foregroundService} key from the persisted CallKeep settings
     * in SharedPreferences before dispatching the Telecom incoming call.
     * <p>
     * VoiceConnectionService.onCreateIncomingConnection() reads SharedPreferences via
     * {@code this.getSettings(this)} and then calls {@code startForegroundService()}.
     * If a previous build stored a {@code foregroundService.channelId} value, that
     * stale entry makes {@code isForegroundServiceConfigured()} return true, causing
     * {@code startForegroundService()} to dereference
     * {@code RNCallKeepModule.instance.getCurrentReactActivity()} — which is null in a
     * killed-app process — and crash with a NullPointerException.
     * Removing the key here guarantees the safe path regardless of upgrade history.
     */
    private void clearForegroundServiceSettings() {
        try {
            SharedPreferences sharedPref = getApplicationContext()
                    .getSharedPreferences("rn-callkeep", Context.MODE_PRIVATE);
            String jsonString = sharedPref.getString("settings", null);
            if (jsonString == null) return;
            JSONObject settings = new JSONObject(jsonString);
            if (settings.has("foregroundService")) {
                settings.remove("foregroundService");
                sharedPref.edit().putString("settings", settings.toString()).apply();
                Log.d(TAG, "clearForegroundServiceSettings: removed stale foregroundService key");
            }
        } catch (Exception e) {
            Log.w(TAG, "clearForegroundServiceSettings failed: " + e.getMessage());
        }
    }

    private void deletePendingCallFile() {
        try {
            File file = new File(getFilesDir(), PENDING_CALL_FILE);
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        } catch (Exception e) {
            Log.w(TAG, "deletePendingCallFile failed: " + e.getMessage());
        }
    }

    private void writePendingCallFile(String callId, String callerId, String callerName) {
        try {
            JSONObject json = new JSONObject();
            json.put("callId",     callId);
            json.put("callerId",   callerId);
            json.put("callerName", callerName);
            json.put("arrivedAt",  System.currentTimeMillis());

            File file = new File(getFilesDir(), PENDING_CALL_FILE);
            try (FileWriter writer = new FileWriter(file, false)) {
                writer.write(json.toString());
            }
            Log.d(TAG, "Pending call written to " + file.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "writePendingCallFile failed: " + e.getMessage(), e);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Call cancelled
    // ──────────────────────────────────────────────────────────────────────────

    private void handleCallCancelled(Map<String, String> data) {
        String callId = data.get("callId");
        if (callId == null) return;

        // Terminate the live VoiceConnection so the system call screen is dismissed.
        // VoiceConnectionService.currentConnections is a public static Map<String,
        // VoiceConnection> keyed by EXTRA_CALL_UUID value (= the server callId).
        try {
            Connection conn = VoiceConnectionService.getConnection(callId);
            if (conn != null) {
                conn.setDisconnected(new DisconnectCause(DisconnectCause.MISSED));
                conn.destroy();
                Log.d(TAG, "call_cancelled: connection terminated for callId=" + callId);
            } else {
                Log.d(TAG, "call_cancelled: no live connection for callId=" + callId
                        + " (app may be in foreground — JS CallContext handles UI)");
            }
        } catch (Exception e) {
            Log.e(TAG, "handleCallCancelled connection teardown failed: " + e.getMessage(), e);
        }

        // Unregister the pre-answer receiver if it was not already cleaned up by
        // an answer/decline broadcast.  Without this, a caller-cancel that arrives
        // before any LocalBroadcast fires (e.g. before VoiceConnectionService even
        // creates a connection) would leave the receiver registered forever.
        BroadcastReceiver par = sPreAnswerReceiver;
        if (par != null) {
            try {
                LocalBroadcastManager.getInstance(getApplicationContext())
                        .unregisterReceiver(par);
            } catch (Exception ignored) {}
            sPreAnswerReceiver = null;
            Log.d(TAG, "handleCallCancelled: pre-answer receiver released");
        }

        // Delete the pending call file so the foreground app doesn't attempt to
        // resume a call that no longer exists.
        try {
            File file = new File(getFilesDir(), PENDING_CALL_FILE);
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
                Log.d(TAG, "Pending call file deleted for callId=" + callId);
            }
        } catch (Exception e) {
            Log.e(TAG, "handleCallCancelled file deletion failed: " + e.getMessage(), e);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Forward non-call messages to the RNFirebase headless JS task service
    // ──────────────────────────────────────────────────────────────────────────

    private void forwardToHeadlessService(@NonNull RemoteMessage remoteMessage) {
        // Only start the headless service when the app is not already in the foreground.
        // In the foreground, RNFirebase's event emitter delivers the message to JS via
        // the onMessage listener without needing the headless task.
        if (SharedUtils.isAppInForeground(this)) {
            return;
        }
        try {
            Intent intent = new Intent(this,
                io.invertase.firebase.messaging.ReactNativeFirebaseMessagingHeadlessService.class);
            intent.putExtra("message", remoteMessage);
            startService(intent);
            HeadlessJsTaskService.acquireWakeLockNow(this);
        } catch (Exception e) {
            Log.w(TAG, "forwardToHeadlessService failed: " + e.getMessage());
        }
    }

}
`;

const LISTENER_SERVICE_SOURCE = `\
package ${PACKAGE_NAME};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

/**
 * Short-lived foreground service that monitors ACTION_ANSWER_CALL while the
 * system lock-screen call UI is ringing on a killed-app process.
 *
 * Why a foreground service (not background service)?
 *   On Android 8+ (API 26+), background-execution limits prevent starting a
 *   background service from an FCM handler. startForegroundService() is exempt.
 *   The service calls startForeground() immediately in onStartCommand() to
 *   satisfy the 5-second ANR budget.
 *
 * When VoiceConnectionService.onAnswer() fires ACTION_ANSWER_CALL via
 * LocalBroadcastManager (same process, lives because Telecom bound VCS):
 *   1. Marks callkeep_pending.json with "answered": true so CallContext
 *      auto-accepts the call when the app mounts.
 *   2. Launches MainActivity via getLaunchIntentForPackage() with FLAG_ACTIVITY_NEW_TASK.
 *      Permitted because the service runs in the same process as the Telecom-bound
 *      VoiceConnectionService — the Telecom system-service binding grants the app a
 *      background-activity-start exemption on API 29+.
 *   3. Stops itself.
 *
 * The silent IMPORTANCE_MIN notification does not appear in the status bar.
 */
public class CallAnswerListenerService extends Service {
    private static final String TAG = "CallAnswerListener";
    private static final int    NOTIFICATION_ID = 9001;
    private static final String CHANNEL_ID      = "call_answer_listener";
    // Exact string values from io.wazo.callkeep.Constants
    private static final String ACTION_ANSWER_CALL = "ACTION_ANSWER_CALL";
    private static final String ACTION_END_CALL    = "ACTION_END_CALL";
    /** Must match CallFirebaseMessagingService.PENDING_CALL_FILE */
    private static final String PENDING_CALL_FILE  = "callkeep_pending.json";

    private BroadcastReceiver callEventReceiver;
    private final Handler  stopHandler  = new Handler();
    private final Runnable stopRunnable = this::stopSelf;

    // Guard against repeated onStartCommand() calls (e.g. Firebase SDK re-delivering
    // the FCM intent, or a second startForegroundService() from a retry path).
    // Without this guard, each extra start overwrites callEventReceiver (the previous
    // registration leaks) and adds another postDelayed(stopRunnable) to the queue.
    private boolean started = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // MUST call startForeground() on every invocation — Android requires it
        // within 5 s even on repeated starts; calling it again is a no-op.
        startForeground(NOTIFICATION_ID, buildSilentNotification());

        if (started) {
            // Already set up from a prior start; nothing more to do.
            Log.d(TAG, "onStartCommand: already started, skipping duplicate setup");
            return START_NOT_STICKY;
        }
        started = true;

        // Backup receiver for the answer/decline path.
        // The primary pre-answer receiver in CallFirebaseMessagingService handles
        // rapid answers (registered before addNewIncomingCall); this receiver is a
        // redundant safety net for the case where that registration is missed.
        callEventReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent rcvIntent) {
                if (ACTION_ANSWER_CALL.equals(rcvIntent.getAction())) {
                    handleCallAnswered();
                } else {
                    // Declined or ended before answering — just stop
                    stopSelf();
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_ANSWER_CALL);
        filter.addAction(ACTION_END_CALL);
        LocalBroadcastManager.getInstance(this)
                .registerReceiver(callEventReceiver, filter);

        // Stop automatically at call TTL + buffer to avoid leaking the service.
        stopHandler.postDelayed(stopRunnable, 65_000);
        return START_NOT_STICKY;
    }

    private void handleCallAnswered() {
        // Mark the pending file so CallContext knows the call was already
        // accepted in the system UI and can auto-accept without waiting for
        // a CallKeep answer event (which requires RN to be initialised first).
        markPendingCallAnswered();

        // Launch the app — the Telecom process-binding grants the background-
        // activity-start exemption needed on API 29+.
        try {
            Intent launch = getPackageManager()
                    .getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(launch);
                Log.d(TAG, "MainActivity launched after call answer");
            } else {
                Log.w(TAG, "getLaunchIntentForPackage returned null");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch MainActivity: " + e.getMessage());
        }
        stopSelf();
    }

    private void markPendingCallAnswered() {
        try {
            File file = new File(getFilesDir(), PENDING_CALL_FILE);
            if (!file.exists()) {
                Log.w(TAG, "markPendingCallAnswered: file not found");
                return;
            }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
            }
            JSONObject json = new JSONObject(sb.toString());
            json.put("answered", true);
            try (FileWriter writer = new FileWriter(file, false)) {
                writer.write(json.toString());
            }
            Log.d(TAG, "Marked pending call as answered");
        } catch (Exception e) {
            Log.w(TAG, "markPendingCallAnswered failed: " + e.getMessage());
        }
    }

    private Notification buildSilentNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Call events", NotificationManager.IMPORTANCE_MIN);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setShowBadge(false);
            NotificationManager manager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("Входящий звонок")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setSilent(true)
                .build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopHandler.removeCallbacks(stopRunnable);
        if (callEventReceiver != null) {
            LocalBroadcastManager.getInstance(this)
                    .unregisterReceiver(callEventReceiver);
            callEventReceiver = null;
        }
        stopForeground(true);
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
`;

module.exports = function withFirebaseCallService(config) {

  // ── Step 1: write Java source files during EAS native build ───────────────
  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const packageDir = path.join(
        projectRoot,
        'android', 'app', 'src', 'main', 'java',
        ...PACKAGE_NAME.split('.'),
      );
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, 'CallFirebaseMessagingService.java'),
        JAVA_SOURCE,
        'utf8',
      );
      fs.writeFileSync(
        path.join(packageDir, 'CallAnswerListenerService.java'),
        LISTENER_SERVICE_SOURCE,
        'utf8',
      );
      // Remove CallFCMReceiver.java if it exists from a previous prebuild that
      // generated it. The receiver was removed from the architecture; leaving a
      // stale .java file would cause a compile error (unresolved references).
      const staleReceiver = path.join(packageDir, 'CallFCMReceiver.java');
      if (fs.existsSync(staleReceiver)) {
        fs.unlinkSync(staleReceiver);
      }
      return modConfig;
    },
  ]);

  // ── Step 2: declare the service + telephony features in AndroidManifest ────
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    // <uses-feature> declarations for Android to recognise the app as a call provider
    if (!manifest['uses-feature']) manifest['uses-feature'] = [];
    for (const name of ['android.hardware.telephony', 'android.software.telecom']) {
      if (!manifest['uses-feature'].some((f) => f.$?.['android:name'] === name)) {
        manifest['uses-feature'].push({
          $: { 'android:name': name, 'android:required': 'false' },
        });
      }
    }

    const application = manifest.application?.[0];
    if (!application) return modConfig;
    if (!application.service) application.service = [];

    const SERVICE_NAME = `${PACKAGE_NAME}.CallFirebaseMessagingService`;
    // Remove ReactNativeFirebaseMessagingService from the manifest.
    // Our service takes over ALL com.google.firebase.MESSAGING_EVENT delivery.
    // Non-call messages are forwarded explicitly to
    // ReactNativeFirebaseMessagingHeadlessService in forwardToHeadlessService().
    const RNFB_SERVICE = 'io.invertase.firebase.messaging.ReactNativeFirebaseMessagingService';
    application.service = (application.service ?? []).filter(
      (s) => s.$?.['android:name'] !== RNFB_SERVICE,
    );

    // Always remove any existing CallFirebaseMessagingService entry and re-add
    // it with the correct attributes. A simple "if not exists, push" check would
    // leave a stale entry from a previous prebuild that had exported=true.
    application.service = application.service.filter(
      (s) => s.$?.['android:name'] !== SERVICE_NAME,
    );
    application.service.push({
      $: {
        // exported="false": com.google.firebase.MESSAGING_EVENT is a direct
        // startService() call from the Firebase SDK running inside the same app
        // process — it does not require the service to be externally visible.
        // Keeping it non-exported matches the standard FirebaseMessagingService
        // pattern and prevents other apps from spoofing call intents.
        'android:name': SERVICE_NAME,
        'android:exported': 'false',
      },
      'intent-filter': [
        {
          action: [
            { $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } },
          ],
        },
      ],
    });

    // Remove stale CallFCMReceiver entry that was generated by a previous prebuild.
    // The receiver was removed from the architecture; if left in the manifest it
    // would register a dead class and cause a ClassNotFoundException at runtime.
    const FCM_RECEIVER_NAME = `${PACKAGE_NAME}.CallFCMReceiver`;
    if (application.receiver) {
      application.receiver = application.receiver.filter(
        (r) => r.$?.['android:name'] !== FCM_RECEIVER_NAME,
      );
    }

    // ── CallAnswerListenerService ─────────────────────────────────────────────
    // Foreground service started by CallFirebaseMessagingService after
    // TelecomManager.addNewIncomingCall(). Listens for ACTION_ANSWER_CALL via
    // LocalBroadcastManager and launches MainActivity when the user accepts.
    // android:exported="false": never needs to be started by external components.
    // android:foregroundServiceType="shortService": recognised on API 34+
    // (Android 14), treated as NONE on API 26-33. Does NOT require any
    // additional foreground-service-type permission.
    const LISTENER_SERVICE_NAME = `${PACKAGE_NAME}.CallAnswerListenerService`;
    if (!application.service.some((s) => s.$?.['android:name'] === LISTENER_SERVICE_NAME)) {
      application.service.push({
        $: {
          'android:name': LISTENER_SERVICE_NAME,
          'android:exported': 'false',
          'android:foregroundServiceType': 'shortService',
        },
      });
    }

    return modConfig;
  });

  return config;
};
