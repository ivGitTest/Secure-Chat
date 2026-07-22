import { WebSocket } from "ws";
import type { WsEnvelope } from "./types";

/**
 * Live connections map: userId → WebSocket.
 * At most one entry per user — new connection evicts the old one.
 */
export const onlineUsers = new Map<string, WebSocket>();

/** Send an envelope to a specific WebSocket (no-op if closed). */
export function send(ws: WebSocket, envelope: WsEnvelope): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(envelope));
  }
}

/**
 * Send an envelope to a user by ID.
 * @returns true if the user was online and the message was sent.
 */
export function sendToUser(userId: string, envelope: WsEnvelope): boolean {
  const ws = onlineUsers.get(userId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(envelope));
    return true;
  }
  return false;
}
