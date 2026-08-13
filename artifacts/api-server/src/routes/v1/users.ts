import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { contactVisibility, users } from "@workspace/db";
import { and, eq, ne, notExists, or } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/v1/users/me
router.get("/me", (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { userId } = req.user!;
      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found." } });
        return;
      }

      res.json({ id: user.id, name: user.name });
    } catch (err: unknown) {
      req.log.error({ err }, "Get current user error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

// GET /api/v1/users
router.get("/", (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { userId } = req.user!;
      const hiddenPair = db
        .select({ userId: contactVisibility.userId })
        .from(contactVisibility)
        .where(
          or(
            and(
              eq(contactVisibility.userId, userId),
              eq(contactVisibility.visibleUserId, users.id),
            ),
            and(
              eq(contactVisibility.userId, users.id),
              eq(contactVisibility.visibleUserId, userId),
            ),
          ),
        );

      const allUsers = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(ne(users.id, userId), notExists(hiddenPair)));

      res.json(allUsers);
    } catch (err: unknown) {
      req.log.error({ err }, "Get users error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

export default router;
