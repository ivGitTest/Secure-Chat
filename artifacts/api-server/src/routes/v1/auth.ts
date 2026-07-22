import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { users, devices, sessions } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

const MAX_FAILED_ATTEMPTS = 2;

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) throw new Error("JWT_SECRET or SESSION_SECRET environment variable is required");
  return secret;
}

function getExpiresInSeconds(): number {
  const raw = process.env["JWT_EXPIRES_IN"];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return isNaN(parsed) ? 86400 : parsed;
}

// Rate limiter for login: 5 requests per minute per IP
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: { code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Try again later." },
    });
  },
});

// Rate limiter for authenticated routes: 120 requests per minute per user
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId ?? req.ip ?? "unknown",
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded." } });
  },
});

// POST /api/v1/auth/login
router.post("/login", loginRateLimiter, (req: Request, res: Response): void => {
  void (async () => {
    const { userId, pin, deviceId } = req.body as {
      userId?: unknown;
      pin?: unknown;
      deviceId?: unknown;
    };

    // Canonicalize inputs once — all subsequent DB reads/writes use these values
    const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
    const normalizedDeviceId = typeof deviceId === "string" ? deviceId.trim() : "";

    if (
      normalizedUserId === "" ||
      typeof pin !== "string" || !/^\d{6}$/.test(pin) ||
      normalizedDeviceId === ""
    ) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "userId, 6-digit pin, and deviceId are required." },
      });
      return;
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, normalizedUserId))
        .limit(1);

      if (!user) {
        res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found." } });
        return;
      }

      if (user.isBlocked) {
        req.log.warn({ userId: normalizedUserId }, "Login attempt on blocked account");
        res.status(403).json({ error: { code: "ACCOUNT_BLOCKED", message: "Account is blocked." } });
        return;
      }

      const pinValid = await argon2.verify(user.pinHash, pin);

      if (!pinValid) {
        const newFailedAttempts = user.failedAttempts + 1;
        const shouldBlock = newFailedAttempts >= MAX_FAILED_ATTEMPTS;

        await db
          .update(users)
          .set({ failedAttempts: newFailedAttempts, isBlocked: shouldBlock })
          .where(eq(users.id, normalizedUserId));

        if (shouldBlock) {
          req.log.warn({ userId: normalizedUserId }, "Account blocked after repeated failed PIN attempts");
          res.status(403).json({
            error: { code: "ACCOUNT_BLOCKED", message: "Account blocked due to too many failed attempts." },
          });
        } else {
          req.log.warn({ userId: normalizedUserId, failedAttempts: newFailedAttempts }, "Invalid PIN attempt");
          res.status(401).json({ error: { code: "INVALID_PIN", message: "Invalid PIN." } });
        }
        return;
      }

      // Reset failed attempts on successful login
      await db.update(users).set({ failedAttempts: 0 }).where(eq(users.id, normalizedUserId));

      // Upsert device
      const [existingDevice] = await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.userId, normalizedUserId))
        .limit(1);

      if (existingDevice) {
        await db
          .update(devices)
          .set({ deviceId: normalizedDeviceId, registeredAt: new Date() })
          .where(and(eq(devices.userId, normalizedUserId), eq(devices.id, existingDevice.id)));
      } else {
        await db.insert(devices).values({ userId: normalizedUserId, deviceId: normalizedDeviceId });
      }

      // Create session
      const expiresInSeconds = getExpiresInSeconds();
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

      const [session] = await db
        .insert(sessions)
        .values({ userId: normalizedUserId, expiresAt })
        .returning({ id: sessions.id });

      if (!session) throw new Error("Failed to create session");

      const accessToken = jwt.sign(
        { sub: normalizedUserId, sessionId: session.id },
        getJwtSecret(),
        { expiresIn: expiresInSeconds },
      );

      req.log.info({ userId: normalizedUserId }, "Login successful");

      res.json({
        accessToken,
        expiresIn: expiresInSeconds,
        user: { id: user.id, name: user.name },
      });
    } catch (err: unknown) {
      req.log.error({ err }, "Login error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

// POST /api/v1/auth/logout
router.post("/logout", requireAuth, apiRateLimiter, (req: Request, res: Response): void => {
  void (async () => {
    try {
      const { sessionId } = req.user!;
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      req.log.info({ userId: req.user!.userId }, "Logout successful");
      res.status(204).send();
    } catch (err: unknown) {
      req.log.error({ err }, "Logout error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
});

export default router;
