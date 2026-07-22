import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { participants, messages, conversations } from "@workspace/db";
import { eq, and, ne, lt, desc } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/v1/conversations
router.get("/", (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { userId } = req.user!;

      // Find all conversations the user participates in
      const myParticipations = await db
        .select({ conversationId: participants.conversationId })
        .from(participants)
        .where(eq(participants.userId, userId));

      if (myParticipations.length === 0) {
        res.json([]);
        return;
      }

      const convIds = myParticipations.map((p) => p.conversationId);

      // For each conversation, get the other participant and last message
      const result = await Promise.all(
        convIds.map(async (convId) => {
          const [otherParticipant] = await db
            .select({ userId: participants.userId })
            .from(participants)
            .where(and(eq(participants.conversationId, convId), ne(participants.userId, userId)))
            .limit(1);

          const [lastMsg] = await db
            .select({ text: messages.text, createdAt: messages.createdAt })
            .from(messages)
            .where(eq(messages.conversationId, convId))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          return {
            id: convId,
            participantId: otherParticipant?.userId ?? null,
            lastMessage: lastMsg?.text ?? null,
            lastMessageTime: lastMsg?.createdAt ?? null,
          };
        }),
      );

      res.json(result);
    } catch (err: unknown) {
      req.log.error({ err }, "Get conversations error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

// GET /api/v1/conversations/:conversationId/messages
router.get("/:conversationId/messages", (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { userId } = req.user!;
      const { conversationId } = req.params as { conversationId: string };

      // Verify the conversation exists
      const [conv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      if (!conv) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Conversation not found." } });
        return;
      }

      // Verify user is a participant
      const [membership] = await db
        .select({ conversationId: participants.conversationId })
        .from(participants)
        .where(and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)))
        .limit(1);

      if (!membership) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied." } });
        return;
      }

      // Parse pagination params
      const rawLimit = parseInt((req.query["limit"] as string | undefined) ?? "50", 10);
      const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 100);
      const before = req.query["before"] as string | undefined;

      let beforeDate: Date | undefined;
      if (before) {
        const parsed = new Date(before);
        if (!isNaN(parsed.getTime())) {
          beforeDate = parsed;
        }
      }

      // Query messages (newest first, then reverse for chronological order)
      const msgs = await db
        .select({
          id: messages.id,
          senderId: messages.senderId,
          text: messages.text,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          beforeDate
            ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, beforeDate))
            : eq(messages.conversationId, conversationId),
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      res.json(msgs.reverse());
    } catch (err: unknown) {
      req.log.error({ err }, "Get messages error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

export default router;
