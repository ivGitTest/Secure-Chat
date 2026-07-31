/**
 * Push notification dispatchers.
 *
 * Two separate paths:
 *
 * 1. Expo Push Service (sendPushNotification)
 *    Used for MESSAGE notifications.
 *    Expo proxies to FCM/APNs. No Firebase credentials needed on the server.
 *    Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * 2. Firebase Admin SDK (sendFcmCallPush)
 *    Used for CALL notifications (data-only, high-priority).
 *    Sends directly to FCM without Expo wrapper — the only way to wake a
 *    killed Android app and trigger the ConnectionService / CallKeep UI.
 *    Requires FIREBASE_SERVICE_ACCOUNT_JSON env var (single-line JSON).
 */
import { logger } from "./logger";
import * as adminModule from "firebase-admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  sound?: "default" | null;
}

// ─── 1. Expo Push Service ─────────────────────────────────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** How long to wait before checking receipts (Expo recommends 15–30s). */
const RECEIPT_CHECK_DELAY_MS = 30_000;

/** Ticket shape returned by push/send */
interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/** Receipt shape returned by push/getReceipts */
interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

async function checkReceipts(ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return;
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify({ ids: ticketIds }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, text }, "push: receipts API error");
      return;
    }
    const json = (await res.json().catch(() => null)) as {
      data?: Record<string, ExpoReceipt>;
    } | null;
    if (!json?.data || typeof json.data !== "object" || Array.isArray(json.data)) {
      logger.warn({ body: JSON.stringify(json).slice(0, 200) }, "push: receipts response had unexpected shape");
      return;
    }
    for (const [id, receipt] of Object.entries(json.data)) {
      if (receipt.status === "ok") {
        logger.info({ ticketId: id }, "push: receipt ok — delivered to FCM/APNs");
      } else {
        const errorCode = receipt.details?.error ?? receipt.message ?? "unknown";
        logger.warn({ ticketId: id, errorCode, receipt }, "push: receipt error — delivery failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "push: network error checking receipts");
  }
}

/**
 * Send a push notification to a single Expo push token (for messages).
 * Silently logs errors — never throws.
 */
export async function sendPushNotification(
  token: string,
  payload: PushPayload,
): Promise<void> {
  if (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken[")) {
    logger.warn({ token }, "push: skipping non-Expo token");
    return;
  }
  const body = { to: token, ...payload };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, text }, "push: Expo API error");
      return;
    }
    const json = (await res.json().catch(() => null)) as {
      data?: ExpoTicket[];
    } | null;
    if (!json?.data || !Array.isArray(json.data)) {
      logger.warn({ body: JSON.stringify(json).slice(0, 200) }, "push: send response had unexpected shape");
      return;
    }
    const ticketIds: string[] = [];
    for (const ticket of json.data) {
      if (ticket.status === "ok" && ticket.id) {
        ticketIds.push(ticket.id);
        logger.info({ ticketId: ticket.id, channelId: payload.channelId }, "push: ticket ok — Expo accepted");
      } else {
        logger.warn({ ticket, channelId: payload.channelId }, "push: ticket error from Expo");
      }
    }
    if (ticketIds.length > 0) {
      setTimeout(() => { void checkReceipts(ticketIds); }, RECEIPT_CHECK_DELAY_MS);
    }
  } catch (err) {
    logger.error({ err }, "push: network error sending notification");
  }
}

// ─── 2. Firebase Admin SDK (direct FCM for VoIP calls) ───────────────────────

type FirebaseAdminApp = adminModule.app.App;
let _firebaseApp: FirebaseAdminApp | null = null;
let _firebaseInitAttempted = false;

/**
 * Lazily initialize Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT_JSON env var.
 * Returns null if the env var is missing or the JSON is invalid.
 */
function getFirebaseApp(): FirebaseAdminApp | null {
  if (_firebaseInitAttempted) return _firebaseApp;
  _firebaseInitAttempted = true;

  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw || raw.trim() === "") {
    logger.info("push/fcm: FIREBASE_SERVICE_ACCOUNT_JSON not set — FCM call push disabled (fallback: Expo push)");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(raw) as adminModule.ServiceAccount;
    _firebaseApp = adminModule.initializeApp({
      credential: adminModule.credential.cert(serviceAccount),
    });
    logger.info("push/fcm: Firebase Admin SDK initialized");
    return _firebaseApp;
  } catch (err) {
    logger.error({ err }, "push/fcm: failed to initialize Firebase Admin — check FIREBASE_SERVICE_ACCOUNT_JSON format");
    return null;
  }
}

/**
 * Send a data-only high-priority FCM push to an Android device.
 * Used exclusively for incoming call notifications — data-only pushes wake
 * the app even when killed and let CallKeep show the system call screen.
 *
 * All values in `data` must be strings (FCM restriction).
 * Never throws — errors are logged silently.
 */
export async function sendFcmCallPush(
  fcmToken: string,
  data: Record<string, string>,
): Promise<void> {
  const app = getFirebaseApp();
  if (!app) return; // Firebase not configured — caller falls back to Expo push

  try {
    const messageId = await adminModule.messaging(app).send({
      token: fcmToken,
      data, // data-only: no notification block → won't show a banner, just wakes the app
      android: {
        priority: "high", // wakes the device even in Doze mode
        ttl: 30_000,      // 30s — call should be answered by then or it expires
      },
    });
    logger.info({ messageId, callId: data["callId"], type: data["type"] }, "push/fcm: call push sent");
  } catch (err) {
    logger.error({ err, type: data["type"] }, "push/fcm: failed to send FCM call push");
  }
}
