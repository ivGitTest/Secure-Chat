import { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import authRouter from "./auth";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import configRouter from "./config";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

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

// Health check (public)
router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Auth routes (login has its own rate limiter defined in auth.ts)
router.use("/auth", authRouter);

// Protected routes
router.use("/users", requireAuth, apiRateLimiter, usersRouter);
router.use("/conversations", requireAuth, apiRateLimiter, conversationsRouter);
router.use("/config", requireAuth, apiRateLimiter, configRouter);

export default router;
