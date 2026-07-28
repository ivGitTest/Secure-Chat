import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { callLogs, users, pushTokens } from "@workspace/db";
import { logger } from "../lib/logger";
import { send, sendToUser } from "./connections";
import { sendPushNotification } from "../lib/pushService";
import type { ExtendedWebSocket, WsEnvelope } from "./types";
import { randomUUID } from "node:crypto";

interface CallState {
  callId: string;
  callerId: string;
  calleeId: string;
  /** null until the callee accepts */
  startedAt: Date | null;
}

/** callId → call state */
const activeCalls = new Map<string, CallState>();
/** userId → callId (for quick lookup) */
const userToCallId = new Map<string, string>();

/**
 * Calls that are waiting for an offline callee to reconnect.
 * calleeId → { callId, timer }
 *
 * When the callee comes online (handleUserConnect), we deliver call.incoming.
 * If they never connect within PENDING_CALL_TTL_MS, the call is expired.
 */
const pendingCallDeliveries = new Map<string, { callId: string; timer: ReturnType<typeof setTimeout> }>();

/** How long to wait for an offline callee to reconnect before expiring the call. */
const PENDING_CALL_TTL_MS = 60_000;

function getCallForUser(userId: string): CallState | null {
  const callId = userToCallId.get(userId);
  if (!callId) return null;
  return activeCalls.get(callId) ?? null;
}

function getOtherParty(call: CallState, userId: string): string {
  return call.callerId === userId ? call.calleeId : call.callerId;
}

async function writeCallLog(call: CallState): Promise<void> {
  if (!call.startedAt) return; // only log calls that were actually connected
  const endedAt = new Date();
  const durationS = Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000);
  try {
    await db.insert(callLogs).values({
      callerId: call.callerId,
      calleeId: call.calleeId,
      startedAt: call.startedAt,
      endedAt,
      durationS,
    });
    logger.info({ callId: call.callId, callerId: call.callerId, calleeId: call.calleeId, durationS }, "WS: call logged");
  } catch (err: unknown) {
    logger.error({ err, callId: call.callId }, "WS: failed to write call log");
  }
}

function removePendingDelivery(calleeId: string, callId: string): void {
  const pending = pendingCallDeliveries.get(calleeId);
  if (pending && pending.callId === callId) {
    clearTimeout(pending.timer);
    pendingCallDeliveries.delete(calleeId);
  }
}

function removeCall(call: CallState): void {
  activeCalls.delete(call.callId);
  userToCallId.delete(call.callerId);
  userToCallId.delete(call.calleeId);
  // Also clean up any pending delivery for this call
  removePendingDelivery(call.calleeId, call.callId);
}

/** Called when a user disconnects — ends any active call they were in. */
export async function handleUserDisconnect(userId: string): Promise<void> {
  const call = getCallForUser(userId);
  if (!call) return;

  logger.info({ userId, callId: call.callId }, "WS: call ended by disconnect");
  const other = getOtherParty(call, userId);
  removeCall(call);
  await writeCallLog(call);

  sendToUser(other, {
    type: "call.end",
    payload: {},
    timestamp: new Date().toISOString(),
  });
}

/**
 * Called by server.ts right after a new WebSocket connection is authenticated
 * and registered in onlineUsers. Delivers any pending call.incoming that was
 * buffered while this user was offline.
 */
export function handleUserConnect(userId: string): void {
  const pending = pendingCallDeliveries.get(userId);
  if (!pending) return;

  const call = activeCalls.get(pending.callId);
  if (!call) {
    // Call was already cancelled/expired
    clearTimeout(pending.timer);
    pendingCallDeliveries.delete(userId);
    return;
  }

  // Check caller is still online (may have hung up while waiting)
  const delivered = sendToUser(userId, {
    type: "call.incoming",
    payload: { callerId: call.callerId },
    timestamp: new Date().toISOString(),
  });

  if (delivered) {
    clearTimeout(pending.timer);
    pendingCallDeliveries.delete(userId);
    logger.info({ callId: call.callId, calleeId: userId }, "WS: delivered pending call.incoming to reconnected callee");
  }
}

/**
 * Send a push notification about an incoming call to the callee.
 * Queries caller name and callee push token in parallel; fires and forgets.
 */
async function sendCallPush(calleeId: string, callerId: string): Promise<void> {
  const [pushRow, callerUser] = await Promise.all([
    db.select({ token: pushTokens.token }).from(pushTokens)
      .where(eq(pushTokens.userId, calleeId)).limit(1).then((r) => r[0]),
    db.select({ name: users.name }).from(users)
      .where(eq(users.id, callerId)).limit(1).then((r) => r[0]),
  ]);
  if (pushRow?.token) {
    await sendPushNotification(pushRow.token, {
      title: "Входящий звонок",
      body: callerUser?.name ?? callerId,
      data: { type: "call", callerId, callerName: callerUser?.name ?? callerId },
      priority: "high",
      sound: "default",
      channelId: "calls",
    });
  }
}

/** Route call/webrtc signaling envelopes. */
export function handleSignaling(ws: ExtendedWebSocket, envelope: WsEnvelope): void {
  const { type, payload } = envelope;
  const { userId } = ws;

  switch (type) {
    case "call.invite": {
      const calleeId = payload?.["calleeId"];
      if (typeof calleeId !== "string" || calleeId.trim() === "") {
        send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "calleeId is required." } });
        return;
      }
      if (calleeId === userId) {
        send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "Cannot call yourself." } });
        return;
      }
      if (userToCallId.has(userId)) {
        send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "Already in a call." } });
        return;
      }
      if (userToCallId.has(calleeId)) {
        send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "Callee is busy." } });
        return;
      }

      const callId = randomUUID();
      const state: CallState = { callId, callerId: userId, calleeId, startedAt: null };
      activeCalls.set(callId, state);
      userToCallId.set(userId, callId);
      userToCallId.set(calleeId, callId);

      const online = sendToUser(calleeId, {
        type: "call.incoming",
        payload: { callerId: userId },
        timestamp: new Date().toISOString(),
      });

      if (!online) {
        // Callee is offline — send push to wake them up, then keep the call state
        // alive so that when they reconnect, handleUserConnect delivers call.incoming.
        // The caller stays in "calling" state (no error sent — client already shows
        // the "Вызов..." overlay). Call expires after PENDING_CALL_TTL_MS.
        void sendCallPush(calleeId, userId);

        const timer = setTimeout(() => {
          // Callee never reconnected — expire the call
          pendingCallDeliveries.delete(calleeId);
          if (activeCalls.get(callId) === state) {
            removeCall(state);
            sendToUser(userId, {
              type: "call.end",
              payload: {},
              timestamp: new Date().toISOString(),
            });
            logger.info({ callId, callerId: userId, calleeId }, "WS: pending call expired (callee never reconnected)");
          }
        }, PENDING_CALL_TTL_MS);

        pendingCallDeliveries.set(calleeId, { callId, timer });
        logger.info({ callId, callerId: userId, calleeId }, "WS: call.invite (callee offline — push sent, call state kept)");
      } else {
        // Callee is online — belt-and-suspenders push to wake the screen
        void sendCallPush(calleeId, userId);
        logger.info({ callId, callerId: userId, calleeId }, "WS: call.invite");
      }
      break;
    }

    case "call.accept": {
      const call = getCallForUser(userId);
      if (!call || call.calleeId !== userId) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "No incoming call to accept." } });
        return;
      }
      call.startedAt = new Date();
      sendToUser(call.callerId, {
        type: "call.accept",
        payload: {},
        timestamp: new Date().toISOString(),
      });
      logger.info({ callId: call.callId, callerId: call.callerId, calleeId: userId }, "WS: call.accept");
      break;
    }

    case "call.reject": {
      const call = getCallForUser(userId);
      if (!call || call.calleeId !== userId) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "No incoming call to reject." } });
        return;
      }
      removeCall(call);
      sendToUser(call.callerId, {
        type: "call.reject",
        payload: {},
        timestamp: new Date().toISOString(),
      });
      logger.info({ callId: call.callId }, "WS: call.reject");
      // No call log — call was never connected
      break;
    }

    case "call.end": {
      const call = getCallForUser(userId);
      if (!call) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "No active call to end." } });
        return;
      }
      const other = getOtherParty(call, userId);
      removeCall(call);
      sendToUser(other, {
        type: "call.end",
        payload: {},
        timestamp: new Date().toISOString(),
      });
      logger.info({ callId: call.callId, endedBy: userId }, "WS: call.end");
      void writeCallLog(call);
      break;
    }

    case "webrtc.offer":
    case "webrtc.answer":
    case "webrtc.iceCandidate": {
      const call = getCallForUser(userId);
      if (!call) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "No active call for signaling." } });
        return;
      }
      const target = getOtherParty(call, userId);
      const delivered = sendToUser(target, {
        type,
        payload: payload ?? {},
        timestamp: new Date().toISOString(),
      });
      if (!delivered) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "Remote peer is offline." } });
      }
      break;
    }

    default: {
      send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: `Unknown message type: ${type}` } });
      break;
    }
  }
}
