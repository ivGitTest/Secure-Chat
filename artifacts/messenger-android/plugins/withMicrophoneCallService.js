/**
 * Expo config plugin: microphone foreground service for active calls.
 *
 * ── Why this plugin exists ────────────────────────────────────────────────────
 *
 * On Android 11+ (API 30+), apps lose microphone access the moment they move
 * to the background unless a foreground service with
 * android:foregroundServiceType="microphone" is running. For a VoIP call this
 * means: the user answers, looks at the in-call screen, then presses Home or
 * locks the device — and the microphone (and therefore WebRTC audio) silently
 * dies.  Android 12+ (API 31+) additionally requires the
 * FOREGROUND_SERVICE_MICROPHONE permission.
 *
 * We do NOT rely on react-native-callkeep's built-in foregroundService config:
 *  - callkeep starts its service during VoiceConnectionService.onCreateIncomingConnection()
 *    which runs in the killed-app native process where RNCallKeepModule.instance
 *    is null. That null-deref is the NPE we guard against with
 *    clearForegroundServiceSettings() in CallFirebaseMessagingService.
 *  - Adding foreground service config to RNCallKeep.setup() would re-introduce
 *    the NPE risk on upgrades (stale SharedPreferences between builds).
 *
 * ── This plugin's approach ────────────────────────────────────────────────────
 *
 * 1. Generates MicrophoneForegroundService.java — a minimal Service that calls
 *    startForeground() with foregroundServiceType=ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
 *    on API 29+.  Displays a persistent "In call" notification for the duration.
 *
 * 2. Generates MicrophoneCallModule.java — a ReactContextBaseJavaModule with
 *    @ReactMethod start(callerName) and @ReactMethod stop().
 *    Exposed as NativeModules.MicrophoneCallService in JS.
 *
 * 3. Generates MicrophoneCallPackage.java — the ReactPackage wrapper.
 *
 * 4. Patches MainApplication.kt to register the package (add(MicrophoneCallPackage())).
 *
 * 5. Adds android:foregroundServiceType="microphone" to the service manifest
 *    entry and android.permission.FOREGROUND_SERVICE_MICROPHONE to the manifest.
 *
 * JS usage (CallContext.tsx):
 *   import { NativeModules } from 'react-native';
 *   // start: called from acceptCall() after peer connection is established
 *   NativeModules.MicrophoneCallService?.start(callerName);
 *   // stop: called from cleanupCall()
 *   NativeModules.MicrophoneCallService?.stop();
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const PACKAGE_NAME = 'com.ivaexpi.messengerandroid';

// ── Java source: MicrophoneForegroundService ──────────────────────────────────

const MIC_SERVICE_SOURCE = `\
package ${PACKAGE_NAME};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/**
 * Foreground service that holds the microphone capability during an active call.
 *
 * Android 11+ (API 30+): background apps cannot access the microphone without
 * an active foreground service with android:foregroundServiceType="microphone".
 * Android 12+ (API 31+): additionally requires FOREGROUND_SERVICE_MICROPHONE.
 *
 * Started by MicrophoneCallModule.start() from JS acceptCall().
 * Stopped by MicrophoneCallModule.stop() from JS cleanupCall().
 * Both are called on the React Native bridge after MainActivity is visible,
 * so the app is always in the foreground at start time.
 */
public class MicrophoneForegroundService extends Service {

    private static final String TAG           = "MicFGService";
    private static final int    NOTIFICATION_ID = 9002;
    private static final String CHANNEL_ID    = "incall_channel";
    private static final String EXTRA_CALLER  = "callerName";

    /** Start (or update) the service from any context. */
    public static void start(Context ctx, String callerName) {
        Intent intent = new Intent(ctx, MicrophoneForegroundService.class);
        intent.putExtra(EXTRA_CALLER, callerName != null ? callerName : "");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    /** Stop the service. */
    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, MicrophoneForegroundService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String caller = (intent != null) ? intent.getStringExtra(EXTRA_CALLER) : null;
        if (caller == null || caller.isEmpty()) caller = "Звонок";

        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("Активный звонок")
                .setContentText(caller)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setSilent(true)
                .build();

        // On API 29+, pass FOREGROUND_SERVICE_TYPE_MICROPHONE so Android permits
        // microphone access while the screen is locked or the app is backgrounded.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        Log.d(TAG, "Microphone foreground service started: " + caller);
        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Активный звонок",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            channel.enableVibration(false);
            NotificationManager nm =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
        Log.d(TAG, "Microphone foreground service stopped");
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
`;

// ── Java source: MicrophoneCallModule ─────────────────────────────────────────

const MIC_MODULE_SOURCE = `\
package ${PACKAGE_NAME};

import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import javax.annotation.Nonnull;

/**
 * React Native native module that lets JS start / stop MicrophoneForegroundService.
 *
 * Exposed as NativeModules.MicrophoneCallService in JavaScript.
 *
 * Usage in CallContext.tsx:
 *   NativeModules.MicrophoneCallService?.start(callerName)  // in acceptCall()
 *   NativeModules.MicrophoneCallService?.stop()             // in cleanupCall()
 */
public class MicrophoneCallModule extends ReactContextBaseJavaModule {

    MicrophoneCallModule(ReactApplicationContext context) {
        super(context);
    }

    @Nonnull
    @Override
    public String getName() {
        return "MicrophoneCallService";
    }

    @ReactMethod
    public void start(String callerName) {
        Context ctx = getReactApplicationContext().getApplicationContext();
        MicrophoneForegroundService.start(ctx, callerName);
    }

    @ReactMethod
    public void stop() {
        Context ctx = getReactApplicationContext().getApplicationContext();
        MicrophoneForegroundService.stop(ctx);
    }
}
`;

// ── Java source: MicrophoneCallPackage ────────────────────────────────────────

const MIC_PACKAGE_SOURCE = `\
package ${PACKAGE_NAME};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MicrophoneCallPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext context) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new MicrophoneCallModule(context));
        return modules;
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext context) {
        return Collections.emptyList();
    }
}
`;

// ─────────────────────────────────────────────────────────────────────────────

module.exports = function withMicrophoneCallService(config) {

  // ── Step 1: write the three Java source files during EAS prebuild ──────────
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
      fs.writeFileSync(path.join(packageDir, 'MicrophoneForegroundService.java'), MIC_SERVICE_SOURCE, 'utf8');
      fs.writeFileSync(path.join(packageDir, 'MicrophoneCallModule.java'),        MIC_MODULE_SOURCE,  'utf8');
      fs.writeFileSync(path.join(packageDir, 'MicrophoneCallPackage.java'),       MIC_PACKAGE_SOURCE, 'utf8');
      return modConfig;
    },
  ]);

  // ── Step 2: patch MainApplication.kt to register MicrophoneCallPackage ─────
  config = withMainApplication(config, (modConfig) => {
    const { modResults } = modConfig;
    const { contents, language } = modResults;

    if (contents.includes('MicrophoneCallPackage')) {
      return modConfig; // already patched
    }

    if (language === 'kt') {
      // Kotlin (React Native 0.71+):
      // Add import and package registration inside .apply { ... } block
      modResults.contents = contents
        // Add import after "import com.facebook.react.PackageList"
        .replace(
          /(import com\.facebook\.react\.PackageList\n)/,
          `$1import ${PACKAGE_NAME}.MicrophoneCallPackage\n`,
        )
        // Inject into the .apply {} block of getPackages()
        .replace(
          /PackageList\(this\)\.packages\.apply \{/,
          `PackageList(this).packages.apply {\n                    add(MicrophoneCallPackage())`,
        );
    } else {
      // Java (older React Native):
      modResults.contents = contents
        .replace(
          /(import com\.facebook\.react\.PackageList;\n)/,
          `$1import ${PACKAGE_NAME}.MicrophoneCallPackage;\n`,
        )
        .replace(
          /(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);)/,
          `$1\n        packages.add(new MicrophoneCallPackage());`,
        );
    }

    return modConfig;
  });

  // ── Step 3: manifest — register service + add permission ───────────────────
  config = withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) return modConfig;
    if (!application.service) application.service = [];

    const SVC_NAME = `${PACKAGE_NAME}.MicrophoneForegroundService`;

    if (!application.service.some((s) => s.$?.['android:name'] === SVC_NAME)) {
      application.service.push({
        $: {
          'android:name': SVC_NAME,
          'android:exported': 'false',
          // Required for background microphone access on Android 11+.
          // On API 26–28 the attribute is ignored; API 29–30 it is recognised but
          // microphone is the only type we use; API 31+ also needs the permission
          // FOREGROUND_SERVICE_MICROPHONE (added to app.json permissions array).
          'android:foregroundServiceType': 'microphone',
        },
      });
    }

    // FOREGROUND_SERVICE_MICROPHONE — required on API 31+ (Android 12+)
    const PERM = 'android.permission.FOREGROUND_SERVICE_MICROPHONE';
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    if (!manifest['uses-permission'].some((p) => p.$?.['android:name'] === PERM)) {
      manifest['uses-permission'].push({ $: { 'android:name': PERM } });
    }

    return modConfig;
  });

  return config;
};
