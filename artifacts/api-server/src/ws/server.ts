import type * as http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { sessions, users } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { onlineUsers, send } from "./connections";
import { handleMessage } from "./handlers";
import { handleUserDisconnect } from "./signaling";
import type { ExtendedWebSocket } from "./types";

/** Inactivity timeout: close connections with no traffic for 60 seconds. */
const HEARTBEAT_TIMEOUT_MS = 60_000;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) throw new Error("JWT_SECRET or SESSION_SECRET environment variable is required");
  return secret;
}

function resetHeartbeat(ws: ExtendedWebSocket): void {
  clearTimeout(ws.heartbeatTimer);
  ws.heartbeatTimer = setTimeout(() => {
    logger.info({ userId: ws.userId }, "WS: closing inactive connection (heartbeat timeout)");
    ws.terminate();
  }, HEARTBEAT_TIMEOUT_MS);
}

export function setupWebSocketServer(httpServer: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (rawWs: WebSocket, req: http.IncomingMessage) => {
    // Buffer messages that arrive while async auth is in progress.
    // This prevents a race where the client sends before ws.on("message") is registered.
    const pendingMessages: RawData[] = [];
    let authComplete = false;

    rawWs.on("message", (data: RawData) => {
      if (!authComplete) {
        pendingMessages.push(data);
        return;
      }
      const ws = rawWs as ExtendedWebSocket;
      ws.isAlive = true;
      resetHeartbeat(ws);
      handleMessage(ws, data);
    });

    // 1. Extract Bearer token from Authorization header
    const authHeader = req.headers["authorization"];
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
      rawWs.close(4401, "Unauthorized");
      return;
    }

    // 2. Verify JWT synchronously (throws on invalid token)
    let userId: string;
    let sessionId: string;
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      if (typeof decoded === "string") throw new Error("Unexpected string payload");
      const payload = decoded as Record<string, unknown>;
      const sub = payload["sub"];
      const sid = payload["sessionId"];
      if (typeof sub !== "string" || typeof sid !== "string") throw new Error("Missing claims");
      userId = sub;
      sessionId = sid;
    } catch {
      rawWs.close(4401, "Invalid token");
      return;
    }

    // 3. Async DB validation (session + user)
    void (async () => {
      try {
        const now = new Date();
        const [session] = await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(
            and(eq(sessions.id, sessionId), eq(sessions.userId, userId), gt(sessions.expiresAt, now)),
          )
          .limit(1);

        if (!session) {
          rawWs.close(4401, "Session expired");
          return;
        }

        const [user] = await db
          .select({ id: users.id, isBlocked: users.isBlocked })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (!user || user.isBlocked) {
          rawWs.close(4401, "User not found or blocked");
          return;
        }

        // 4. Evict existing connection (max one per user)
        const existing = onlineUsers.get(userId);
        if (existing && existing.readyState === WebSocket.OPEN) {
          logger.info({ userId }, "WS: evicting previous connection");
          existing.close(4000, "Replaced by new connection");
        }

        // 5. Annotate and register the connection
        const ws = rawWs as ExtendedWebSocket;
        ws.userId = userId;
        ws.isAlive = true;
        onlineUsers.set(userId, ws);
        logger.info({ userId }, "WS: connected");

        // 6. Auth complete — flush buffered messages, then start heartbeat
        authComplete = true;
        resetHeartbeat(ws);

        for (const msg of pendingMessages) {
          ws.isAlive = true;
          resetHeartbeat(ws);
          handleMessage(ws, msg);
        }
        pendingMessages.length = 0;

        ws.on("close", (code, reason) => {
          clearTimeout(ws.heartbeatTimer);
          // Remove from online map only if this is still the registered connection
          if (onlineUsers.get(userId) === ws) {
            onlineUsers.delete(userId);
          }
          logger.info({ userId, code, reason: reason.toString() }, "WS: disconnected");
          void handleUserDisconnect(userId);
        });

        ws.on("error", (err) => {
          logger.error({ err, userId }, "WS: socket error");
        });
      } catch (err: unknown) {
        logger.error({ err }, "WS: connection setup error");
        rawWs.close(4500, "Internal error");
      }
    })();
  });

  wss.on("error", (err) => {
    logger.error({ err }, "WS: server error");
  });

  logger.info("WS: server listening on /ws");
  return wss;
}
