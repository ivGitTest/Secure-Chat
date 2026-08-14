import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { callLogs, users, pushTokens } from "@workspace/db";
import { logger } from "../lib/logger";
import { onlineUsers, send, sendToUser } from "./connections";
import { sendPushNotification, sendFcmCallPush } from "../lib/pushService";
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

/**
 * Participants of a CONNECTED call whose WebSocket dropped, waiting for them to
 * reconnect. userId → { callId, timer }
 *
 * WebRTC media flows peer-to-peer, so a brief signaling-socket drop (network
 * blip, doze reconnect) must not kill an ongoing call. Only if the participant
 * fails to reconnect within CALL_RECONNECT_GRACE_MS do we end the call.
 */
const pendingDisconnectEnds = new Map<string, { callId: string; timer: ReturnType<typeof setTimeout> }>();

/** How long a connected-call participant may stay disconnected before the call is ended. */
const CALL_RECONNECT_GRACE_MS = 30_000;

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
  // And any disconnect-grace timers for either participant — the call is gone,
  // so a later timer firing must not try to end a newer call.
  for (const participant of [call.callerId, call.calleeId]) {
    const pending = pendingDisconnectEnds.get(participant);
    if (pending && pending.callId === call.callId) {
      clearTimeout(pending.timer);
      pendingDisconnectEnds.delete(participant);
    }
  }
}

/**
 * Remove a call and, if it was never answered (startedAt === null), send an
 * FCM push to dismiss any CallKeep incoming-call screen still showing on the
 * callee's device.
 *
 * This covers every caller-side cancellation path — caller disconnect, caller
 * call.end before answer, and TTL expiry — so the callee's lock screen never
 * gets stuck ringing after the caller has already given up.
 */
async function removeCallAndCancelIfNeeded(call: CallState, alsoNotifyUserId?: string): Promise<void> {
  removeCall(call);
  if (call.startedAt === null) {
    // Call was never answered — callee may still have a CallKeep screen showing
    await sendCallCancelPush(call.calleeId, call.callId);
  } else if (alsoNotifyUserId) {
    // Connected call ended — the other party may have the app backgrounded with
    // a frozen JS thread, so the WS call.end alone may never be processed.
    // The FCM cancel push tears down the native Telecom UI / ongoing-call state
    // even when JS is frozen, preventing a stuck call screen.
    await sendCallCancelPush(alsoNotifyUserId, call.callId);
  }
}

/** Cancel a pending disconnect-end timer for a user (they reconnected in time). */
function cancelPendingDisconnectEnd(userId: string): void {
  const pending = pendingDisconnectEnds.get(userId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingDisconnectEnds.delete(userId);
    logger.info({ userId, callId: pending.callId }, "WS: call participant reconnected within grace period");
  }
}

/** Definitively end a call because `userId` went away. Notifies the other party on every channel. */
function endCallByDisconnect(userId: string, call: CallState): void {
  logger.info({ userId, callId: call.callId }, "WS: call ended by disconnect");
  const other = getOtherParty(call, userId);

  // Send WebSocket termination FIRST — before any async DB/FCM work — so the
  // other party receives call.end immediately.
  sendToUser(other, {
    type: "call.end",
    payload: { callId: call.callId },
    timestamp: new Date().toISOString(),
  });

  // FCM cancel push and call log are best-effort; fire-and-forget so a slow
  // database or FCM network call cannot delay the WS termination above.
  void removeCallAndCancelIfNeeded(call, other);
  void writeCallLog(call);
}

/** Called when a user disconnects — ends (or schedules ending of) any active call they were in. */
export async function handleUserDisconnect(userId: string): Promise<void> {
  const call = getCallForUser(userId);
  if (!call) return;

  if (call.startedAt !== null) {
    // Connected call: media flows peer-to-peer, so give the participant a
    // grace window to re-establish the signaling socket (background reconnect,
    // brief network blip) before killing the call.
    const existing = pendingDisconnectEnds.get(userId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      pendingDisconnectEnds.delete(userId);
      // Re-check: the call may have ended by other means during the grace period.
      const current = activeCalls.get(call.callId);
      if (!current) return;
      // Safety net: if the user is somehow back online, do not kill the call.
      if (onlineUsers.has(userId)) {
        logger.info({ userId, callId: call.callId }, "WS: grace timer fired but user is online — keeping call");
        return;
      }
      endCallByDisconnect(userId, current);
    }, CALL_RECONNECT_GRACE_MS);
    pendingDisconnectEnds.set(userId, { callId: call.callId, timer });
    logger.info(
      { userId, callId: call.callId, graceMs: CALL_RECONNECT_GRACE_MS },
      "WS: call participant disconnected, starting reconnect grace period",
    );
    return;
  }

  // Unanswered call (ringing): end immediately — the caller vanishing must
  // dismiss the callee's ringing screen right away, and vice versa.
  endCallByDisconnect(userId, call);
}

/**
 * Called by server.ts right after a new WebSocket connection is authenticated
 * and registered in onlineUsers. Delivers any pending call.incoming that was
 * buffered while this user was offline.
 */
export function handleUserConnect(userId: string): void {
  // If this user is a connected-call participant who dropped and came back
  // within the grace window, cancel the scheduled call termination.
  cancelPendingDisconnectEnd(userId);

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
    payload: { callerId: call.callerId, callId: call.callId },
    timestamp: new Date().toISOString(),
  });

  if (delivered) {
    clearTimeout(pending.timer);
    pendingCallDeliveries.delete(userId);
    logger.info({ callId: call.callId, calleeId: userId }, "WS: delivered pending call.incoming to reconnected callee");
  }
  // Note: sendCallPush was already called when the invite was sent (calleeId was offline).
  // No second push here — the CallKeep UI is already showing on the device.
}

/**
 * Send a push notification about an incoming call to the callee.
 * Queries caller name and callee push token in parallel; fires and forgets.
 */
async function sendCallPush(calleeId: string, callerId: string, callId: string): Promise<void> {
  const [pushRow, callerUser] = await Promise.all([
    db.select({ token: pushTokens.token, fcmToken: pushTokens.fcmToken }).from(pushTokens)
      .where(eq(pushTokens.userId, calleeId)).limit(1).then((r) => r[0]),
    db.select({ name: users.name }).from(users)
      .where(eq(users.id, callerId)).limit(1).then((r) => r[0]),
  ]);

  if (!pushRow) return;
  const callerName = callerUser?.name ?? callerId;

  if (pushRow.fcmToken) {
    // FCM data-only push: wakes the app even when killed and triggers CallKeep
    // (Android ConnectionService shows the full-screen incoming call UI)
    await sendFcmCallPush(pushRow.fcmToken, {
      type: "call",
      callId,
      callerId,
      callerName,
    });
  } else if (pushRow.token) {
    // Fallback: Expo push (shows a banner — works when backgrounded, not when killed)
    await sendPushNotification(pushRow.token, {
      title: "Входящий звонок",
      body: callerName,
      data: { type: "call", callId, callerId, callerName },
      priority: "high",
      sound: "default",
      channelId: "calls",
    });
  }
}

/**
 * Send an FCM data-only push to dismiss a CallKeep incoming-call screen.
 * Called when a pending call expires (caller hung up or TTL elapsed) while the
 * callee may still be showing the system call UI from an earlier push.
 */
async function sendCallCancelPush(calleeId: string, callId: string): Promise<void> {
  const pushRow = await db
    .select({ fcmToken: pushTokens.fcmToken })
    .from(pushTokens)
    .where(eq(pushTokens.userId, calleeId))
    .limit(1)
    .then((r) => r[0]);

  if (pushRow?.fcmToken) {
    await sendFcmCallPush(pushRow.fcmToken, { type: "call_cancelled", callId });
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

      // Echo callId back to the caller so the client can track the active call UUID
      // for CallKeep end/report operations (endCallKeep requires the server UUID).
      send(ws, {
        type: "call.initiated",
        payload: { callId },
        timestamp: new Date().toISOString(),
      });

      const online = sendToUser(calleeId, {
        type: "call.incoming",
        payload: { callerId: userId, callId },
        timestamp: new Date().toISOString(),
      });

      if (!online) {
        // Callee is offline — send push to wake them up, then keep the call state
        // alive so that when they reconnect, handleUserConnect delivers call.incoming.
        // The caller stays in "calling" state (no error sent — client already shows
        // the "Вызов..." overlay). Call expires after PENDING_CALL_TTL_MS.
        void sendCallPush(calleeId, userId, callId);

        const timer = setTimeout(() => {
          // Callee never reconnected — expire the call.
          // removeCallAndCancelIfNeeded sends the FCM cancel push because
          // state.startedAt === null (call was never answered).
          pendingCallDeliveries.delete(calleeId);
          if (activeCalls.get(callId) === state) {
            void removeCallAndCancelIfNeeded(state);
            sendToUser(userId, {
              type: "call.end",
              payload: { callId },
              timestamp: new Date().toISOString(),
            });
            logger.info({ callId, callerId: userId, calleeId }, "WS: pending call expired (callee never reconnected)");
          }
        }, PENDING_CALL_TTL_MS);

        pendingCallDeliveries.set(calleeId, { callId, timer });
        logger.info({ callId, callerId: userId, calleeId }, "WS: call.invite (callee offline — push sent, call state kept)");
      } else {
        // Callee is online but the app's JS runtime may still be backgrounded,
        // paused under Doze, or temporarily unscheduled.  The high-priority FCM
        // push acts as a wake path that works even when the JS thread is not
        // actively processing messages.  The atomic ConcurrentHashMap claim in
        // CallFirebaseMessagingService / CallClaimModule ensures only one of the
        // FCM or WS paths calls TelecomManager.addNewIncomingCall — whichever
        // path arrives first wins the claim; the other returns without touching Telecom.
        void sendCallPush(calleeId, userId, callId);
        logger.info({ callId, callerId: userId, calleeId }, "WS: call.invite (callee online — WS + FCM, atomic claim deduplicates)");
      }
      break;
    }

    case "call.accept": {
      const call = getCallForUser(userId);
      if (!call || call.calleeId !== userId) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "No incoming call to accept." } });
        return;
      }
      // Idempotency guard: if startedAt is already set the call was already accepted.
      // A duplicate call.accept (race between CallKeep answer event and in-app button)
      // must not re-emit to the caller — it would cause the caller to call
      // createOffer/setLocalDescription a second time and break signaling.
      if (call.startedAt !== null) {
        logger.warn({ callId: call.callId }, "WS: duplicate call.accept ignored");
        break;
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
      // removeCallAndCancelIfNeeded is a no-op for the FCM path here because
      // call.startedAt === null and the callee is the one rejecting — their screen
      // is already being dismissed by reportCallUnanswered() on the client.
      // The FCM cancel is still sent as a safety net in case the CallKeep UI
      // persisted across a background restart.
      void removeCallAndCancelIfNeeded(call);
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
      // Always send the FCM cancel push alongside the WS event:
      // - unanswered call: dismisses the callee's CallKeep ringing screen;
      // - connected call: tears down the other party's native call UI even if
      //   their app is backgrounded with frozen JS (stuck-screen prevention).
      void removeCallAndCancelIfNeeded(call, other);
      sendToUser(other, {
        type: "call.end",
        payload: { callId: call.callId },
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
