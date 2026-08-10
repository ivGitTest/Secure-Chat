import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { sessions, users } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface AuthUser {
  userId: string;
  sessionId: string;
}

interface JwtPayload {
  sub: string;
  sessionId: string;
  exp?: number;
  iat?: number;
}

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) throw new Error("JWT_SECRET or SESSION_SECRET environment variable is required");
  return secret;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid Authorization header." },
    });
    return;
  }

  const token = authHeader.slice(7);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token." } });
    return;
  }

  const { sub: userId, sessionId } = payload;
  if (!userId || !sessionId) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token payload." } });
    return;
  }

  void (async () => {
    try {
      const now = new Date();
      const [session] = await db
        .select({ id: sessions.id, userId: sessions.userId })
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
        .limit(1);

      if (!session) {
        res.status(401).json({
          error: { code: "UNAUTHORIZED", message: "Session expired or not found." },
        });
        return;
      }

      const [user] = await db
        .select({ id: users.id, isBlocked: users.isBlocked })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not found." } });
        return;
      }

      if (user.isBlocked) {
        res.status(403).json({ error: { code: "ACCOUNT_BLOCKED", message: "Account is blocked." } });
        return;
      }

      req.user = { userId, sessionId };
      next();
    } catch (err: unknown) {
      logger.error({ err }, "Auth middleware error");
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Internal server error." } });
    }
  })();
}
