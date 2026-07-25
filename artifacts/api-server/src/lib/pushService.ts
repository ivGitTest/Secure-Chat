/**
 * Push notification dispatcher via Expo Push Service.
 * Expo proxies notifications to FCM (Android) / APNs (iOS).
 * No Firebase Admin SDK or service account needed on the server.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
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

/**
 * Send a push notification to a single Expo push token.
 * Silently logs errors — never throws, so callers don't need try/catch.
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
      data?: { status: string; message?: string }[];
    } | null;

    // Log any per-token errors returned in the response body
    if (json?.data) {
      for (const entry of json.data) {
        if (entry.status !== "ok") {
          logger.warn({ entry }, "push: token error from Expo");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "push: network error sending notification");
  }
}
