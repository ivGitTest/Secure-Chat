import type { WebSocket } from "ws";

/** Standard envelope for all WS messages (both directions). */
export interface WsEnvelope {
  type: string;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

/** WebSocket connection with user identity and heartbeat state attached. */
export interface ExtendedWebSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
  heartbeatTimer?: ReturnType<typeof setTimeout>;
}
