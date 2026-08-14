import type { RawData } from "ws";
import { eq, ne, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { messages, participants, conversations, users, pushTokens } from "@workspace/db";
import { sendPushNotification } from "../lib/pushService";
import { logger } from "../lib/logger";
import { send, sendToUser } from "./connections";
import { handleSignaling } from "./signaling";
import type { ExtendedWebSocket, WsEnvelope } from "./types";

/** Parse raw WS data into an envelope; returns null on parse failure. */
function parseEnvelope(data: RawData): WsEnvelope | null {
  let text: string;
  try {
    if (Buffer.isBuffer(data)) {
      text = data.toString("utf-8");
    } else if (data instanceof ArrayBuffer) {
      text = Buffer.from(data).toString("utf-8");
    } else {
      // Buffer[]
      text = Buffer.concat(data as Buffer[]).toString("utf-8");
    }
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj["type"] !== "string") return null;
    return {
      type: obj["type"] as string,
      payload:
        typeof obj["payload"] === "object" && obj["payload"] !== null
          ? (obj["payload"] as Record<string, unknown>)
          : {},
      timestamp:
        typeof obj["timestamp"] === "string"
          ? (obj["timestamp"] as string)
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Main dispatcher — called for every incoming WS message. */
export function handleMessage(ws: ExtendedWebSocket, data: RawData): void {
  const envelope = parseEnvelope(data);
  if (!envelope) {
    send(ws, {
      type: "error",
      payload: { code: "INVALID_MESSAGE", message: "Malformed JSON envelope." },
    });
    return;
  }

  switch (envelope.type) {
    case "message.send":
      void handleMessageSend(ws, envelope);
      break;
    case "message.ack":
      void handleMessageAck(ws, envelope);
      break;
    case "ping":
      send(ws, { type: "pong", timestamp: new Date().toISOString() });
      break;
    default:
      // Delegate call/webrtc events to the signaling module
      handleSignaling(ws, envelope);
      break;
  }
}

// ---------------------------------------------------------------------------
// message.send
// ---------------------------------------------------------------------------

async function handleMessageSend(ws: ExtendedWebSocket, envelope: WsEnvelope): Promise<void> {
  const { userId } = ws;
  const payload = envelope.payload ?? {};
  const text = payload["text"];
  if (typeof text !== "string" || text.trim() === "") {
    send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "text is required." } });
    return;
  }

  try {
    let conversationId: string;
    let recipientId: string;

    const rawConvId = payload["conversationId"];
    const rawRecipId = payload["recipientId"];

    if (typeof rawConvId === "string" && rawConvId.trim() !== "") {
      // Existing conversation: verify sender is a participant
      conversationId = rawConvId.trim();
      const [membership] = await db
        .select({ conversationId: participants.conversationId })
        .from(participants)
        .where(and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)))
        .limit(1);

      if (!membership) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "Conversation not found." } });
        return;
      }

      // Find the other participant
      const [otherParticipant] = await db
        .select({ userId: participants.userId })
        .from(participants)
        .where(and(eq(participants.conversationId, conversationId), ne(participants.userId, userId)))
        .limit(1);

      if (!otherParticipant) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "Conversation has no other participant." } });
        return;
      }
      recipientId = otherParticipant.userId;
    } else if (typeof rawRecipId === "string" && rawRecipId.trim() !== "") {
      // New or existing conversation identified by recipient user ID
      const normalizedRecipId = rawRecipId.trim();
      if (normalizedRecipId === userId) {
        send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "Cannot message yourself." } });
        return;
      }

      // Verify recipient exists
      const [recipientUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, normalizedRecipId))
        .limit(1);

      if (!recipientUser) {
        send(ws, { type: "error", payload: { code: "NOT_FOUND", message: "Recipient not found." } });
        return;
      }
      recipientId = normalizedRecipId;

      // Find or create conversation between sender and recipient
      const senderParticipations = await db
        .select({ conversationId: participants.conversationId })
        .from(participants)
        .where(eq(participants.userId, userId));

      const senderConvIds = senderParticipations.map((p) => p.conversationId);

      let foundConvId: string | null = null;
      if (senderConvIds.length > 0) {
        const [existing] = await db
          .select({ conversationId: participants.conversationId })
          .from(participants)
          .where(
            and(eq(participants.userId, recipientId), inArray(participants.conversationId, senderConvIds)),
          )
          .limit(1);
        if (existing) foundConvId = existing.conversationId;
      }

      if (foundConvId) {
        conversationId = foundConvId;
      } else {
        // Create a new conversation and add both participants
        const [newConv] = await db.insert(conversations).values({}).returning({ id: conversations.id });
        if (!newConv) throw new Error("Failed to create conversation");
        await db.insert(participants).values([
          { conversationId: newConv.id, userId },
          { conversationId: newConv.id, userId: recipientId },
        ]);
        conversationId = newConv.id;
      }
    } else {
      send(ws, {
        type: "error",
        payload: { code: "INVALID_MESSAGE", message: "Either conversationId or recipientId is required." },
      });
      return;
    }

    // Extract optional idempotency key sent by the client
    const rawClientId = payload["clientId"];
    const clientId = typeof rawClientId === "string" && rawClientId.trim() !== ""
      ? rawClientId.trim()
      : null;

    // Idempotency check: if clientId was provided and already exists, the
    // client is retrying a message we already saved (e.g. double-tap or
    // reconnect before receiving message.delivered). Return the saved message
    // without inserting a duplicate.
    if (clientId) {
      const [existing] = await db
        .select()
        .from(messages)
        .where(eq(messages.clientId, clientId))
        .limit(1);

      if (existing) {
        logger.info({ userId, clientId, messageId: existing.id }, "WS: message.send deduplicated");
        send(ws, {
          type: "message.delivered",
          payload: { messageId: existing.id, clientId },
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    // Persist the message
    const [saved] = await db
      .insert(messages)
      .values({ conversationId, senderId: userId, text: text.trim(), clientId })
      .returning();

    if (!saved) throw new Error("Failed to save message");

    logger.info({ userId, conversationId, messageId: saved.id }, "WS: message.send");

    const messagePayload = {
      id: saved.id,
      conversationId: saved.conversationId,
      senderId: saved.senderId,
      text: saved.text,
      createdAt: saved.createdAt.toISOString(),
    };

    // Deliver to recipient if online; fall back to push when they're offline
    const delivered = sendToUser(recipientId, {
      type: "message.new",
      payload: messagePayload,
      timestamp: new Date().toISOString(),
    });

    if (!delivered) {
      // Recipient is offline — fire push notification (best-effort, non-blocking)
      void (async () => {
        const [pushRow, senderUser] = await Promise.all([
          db.select({ token: pushTokens.token }).from(pushTokens)
            .where(eq(pushTokens.userId, recipientId)).limit(1).then((r) => r[0]),
          db.select({ name: users.name }).from(users)
            .where(eq(users.id, userId)).limit(1).then((r) => r[0]),
        ]);
        if (pushRow?.token) {
          await sendPushNotification(pushRow.token, {
            title: senderUser?.name ?? userId,
            body: text.trim(),
            data: { type: "message", conversationId },
            sound: "default",
            channelId: "messages",
          });
        }
      })();
    }

    // Acknowledge to sender — include clientId so the client can match the
    // temp message it showed optimistically.
    send(ws, {
      type: "message.delivered",
      payload: { messageId: saved.id, clientId },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    logger.error({ err, userId }, "WS: handleMessageSend error");
    send(ws, { type: "error", payload: { code: "INTERNAL_ERROR", message: "Failed to send message." } });
  }
}

// ---------------------------------------------------------------------------
// message.ack
// ---------------------------------------------------------------------------

async function handleMessageAck(ws: ExtendedWebSocket, envelope: WsEnvelope): Promise<void> {
  const messageId = envelope.payload?.["messageId"];
  if (typeof messageId !== "string") {
    send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "messageId is required." } });
    return;
  }

  try {
    // Fetch the message so we can authorise the ACK.
    const [msg] = await db
      .select({
        senderId: messages.senderId,
        conversationId: messages.conversationId,
        deliveredAt: messages.deliveredAt,
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!msg) {
      // Do not reveal existence to unauthorised callers.
      logger.warn({ userId: ws.userId, messageId }, "WS: message.ack — message not found");
      return;
    }

    // Only the recipient (not the sender) may ACK a message.
    if (msg.senderId === ws.userId) {
      logger.warn({ userId: ws.userId, messageId }, "WS: message.ack — sender cannot ACK own message");
      return;
    }

    // Verify the authenticated user is a conversation participant.
    const [membership] = await db
      .select({ conversationId: participants.conversationId })
      .from(participants)
      .where(and(eq(participants.conversationId, msg.conversationId), eq(participants.userId, ws.userId)))
      .limit(1);

    if (!membership) {
      logger.warn({ userId: ws.userId, messageId }, "WS: message.ack — not a participant");
      return;
    }

    // Idempotent: if already delivered just relay so a reconnected sender gets the status.
    if (msg.deliveredAt) {
      sendToUser(msg.senderId, {
        type: "message.delivered",
        payload: { messageId },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await db
      .update(messages)
      .set({ deliveredAt: new Date() })
      .where(eq(messages.id, messageId));

    // Relay delivery confirmation to the original sender (best-effort — they may be offline).
    sendToUser(msg.senderId, {
      type: "message.delivered",
      payload: { messageId },
      timestamp: new Date().toISOString(),
    });

    logger.info({ userId: ws.userId, messageId, senderId: msg.senderId }, "WS: message.ack — delivered");
  } catch (err: unknown) {
    logger.error({ err, userId: ws.userId, messageId }, "WS: handleMessageAck error");
  }
}
