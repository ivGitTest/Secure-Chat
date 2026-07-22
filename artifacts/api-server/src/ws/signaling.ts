import { db } from "@workspace/db";
import { callLogs } from "@workspace/db";
import { logger } from "../lib/logger";
import { send, sendToUser } from "./connections";
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

function removeCall(call: CallState): void {
  activeCalls.delete(call.callId);
  userToCallId.delete(call.callerId);
  userToCallId.delete(call.calleeId);
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
      const online = sendToUser(calleeId, {
        type: "call.incoming",
        payload: { callerId: userId },
        timestamp: new Date().toISOString(),
      });
      if (!online) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "User is not online." } });
        return;
      }
      const callId = randomUUID();
      const state: CallState = { callId, callerId: userId, calleeId, startedAt: null };
      activeCalls.set(callId, state);
      userToCallId.set(userId, callId);
      userToCallId.set(calleeId, callId);
      logger.info({ callId, callerId: userId, calleeId }, "WS: call.invite");
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
