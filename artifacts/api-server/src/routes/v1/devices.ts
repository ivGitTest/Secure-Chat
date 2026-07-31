/**
 * Device push-token registration endpoint.
 * POST /api/v1/devices/push-token
 *
 * Accepts both token types from the mobile client:
 *   token    — Expo push token (ExponentPushToken[...]) — used for message pushes
 *   fcmToken — raw FCM registration token               — used for VoIP call pushes
 *
 * Both are optional individually but at least one must be provided.
 * Upserts the row: one row per user, update on conflict.
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
      const body = req.body as { token?: unknown; fcmToken?: unknown };

      const expoToken = typeof body.token === "string" ? body.token.trim() : "";
      const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";

      if (!expoToken && !fcmToken) {
        res.status(400).json({ error: { code: "INVALID_INPUT", message: "token or fcmToken is required." } });
        return;
      }

      if (expoToken) {
        // Upsert with Expo token; preserve existing fcm_token unless a new one is provided
        await db
          .insert(pushTokens)
          .values({
            userId,
            token: expoToken,
            ...(fcmToken ? { fcmToken } : {}),
          })
          .onConflictDoUpdate({
            target: pushTokens.userId,
            set: {
              token: expoToken,
              ...(fcmToken ? { fcmToken } : {}),
              updatedAt: sql`NOW()`,
            },
          });
      } else {
        // FCM token only (no Expo token — update fcm_token field only if row exists)
        // If no row exists yet, we can't insert without an Expo token (token NOT NULL constraint).
        // In practice, the app always sends the Expo token first, so this is safe.
        await db
          .insert(pushTokens)
          .values({
            userId,
            token: "pending",   // placeholder; will be replaced when Expo token arrives
            fcmToken,
          })
          .onConflictDoUpdate({
            target: pushTokens.userId,
            set: {
              fcmToken,
              updatedAt: sql`NOW()`,
            },
          });
      }

      res.status(204).end();
    } catch (err: unknown) {
      req.log.error({ err }, "Register push token error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

export default router;
