/**
 * Push notification dispatcher via Expo Push Service.
 * Expo proxies notifications to FCM (Android) / APNs (iOS).
 * No Firebase Admin SDK or service account needed on the server.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Two-phase delivery:
 *  Phase 1 – push/send:        Expo accepts the message → returns a ticket {id, status}
 *  Phase 2 – push/getReceipts: ~30s later, returns actual FCM/APNs delivery status.
 *                               This is where InvalidCredentials / DeviceNotRegistered appear.
 *  Both phases are logged so failures are visible in `docker logs messenger-api`.
 */
import { logger } from "./logger";

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  sound?: "default" | null;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** How long to wait before checking receipts (Expo recommends 15–30s). */
const RECEIPT_CHECK_DELAY_MS = 30_000;

/** Ticket shape returned by push/send */
interface ExpoTicket {
  status: "ok" | "error";
  /** Present when status === "ok" — use to query receipts later. */
  id?: string;
  /** Present when status === "error" */
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

/**
 * Query Expo receipts for the given ticket IDs and log any delivery failures.
 * Called ~30s after push/send so FCM/APNs has had time to respond.
 */
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
        // Common errors:
        //   InvalidCredentials  — FCM V1 Service Account Key not uploaded to expo.dev
        //   DeviceNotRegistered — token stale, should be removed from DB
        //   MessageRateExceeded — sending too fast
        const errorCode = receipt.details?.error ?? receipt.message ?? "unknown";
        logger.warn({ ticketId: id, errorCode, receipt }, "push: receipt error — delivery failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "push: network error checking receipts");
  }
}

/**
 * Send a push notification to a single Expo push token.
 * Silently logs errors — never throws, so callers don't need try/catch.
 *
 * After 30s, asynchronously checks the Expo receipt to surface FCM/APNs errors
 * (e.g. InvalidCredentials if FCM V1 key is missing on expo.dev).
 */
export async function sendPushNotification(
  token: string,
  payload: PushPayload,
): Promise<void> {
  // Only Expo push tokens are supported
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
        // Phase-1 error — Expo rejected the message outright (bad token format, etc.)
        logger.warn({ ticket, channelId: payload.channelId }, "push: ticket error from Expo");
      }
    }

    // Schedule receipt check — runs in background, does not block the caller.
    // This is where InvalidCredentials surfaces if FCM V1 key is missing on expo.dev.
    if (ticketIds.length > 0) {
      setTimeout(() => {
        void checkReceipts(ticketIds);
      }, RECEIPT_CHECK_DELAY_MS);
    }
  } catch (err) {
    logger.error({ err }, "push: network error sending notification");
  }
}
