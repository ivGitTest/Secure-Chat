/**
 * Device push-token registration endpoint.
 * POST /api/v1/devices/push-token — upsert the authenticated user's Expo push token.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { pushTokens } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// POST /api/v1/devices/push-token
router.post("/push-token", (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { userId } = req.user!;
      const { token } = req.body as { token?: unknown };

      if (typeof token !== "string" || token.trim() === "") {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "token is required." } });
        return;
      }

      const trimmedToken = token.trim();

      // Upsert: one row per user, update token + timestamp on conflict
      await db
        .insert(pushTokens)
        .values({ userId, token: trimmedToken })
        .onConflictDoUpdate({
          target: pushTokens.userId,
          set: {
            token: trimmedToken,
            updatedAt: sql`NOW()`,
          },
        });

      res.status(204).end();
    } catch (err: unknown) {
      req.log.error({ err }, "Register push token error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

export default router;
