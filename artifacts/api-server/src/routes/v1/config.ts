import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

function parseJsonArrayEnv(envVar: string | undefined): string[] {
  if (!envVar) return [];
  try {
    const parsed: unknown = JSON.parse(envVar);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // not JSON — try comma-separated
    return envVar.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// GET /api/v1/config
router.get("/", (_req: Request, res: Response): void => {
  const websocketUrl = process.env["WEBSOCKET_URL"] ?? "";
  const stunServers = parseJsonArrayEnv(process.env["STUN_SERVERS"]);
  const turnServers = parseJsonArrayEnv(process.env["TURN_SERVERS"]);
  const version = process.env["APP_VERSION"] ?? "1.0";

  res.json({
    version,
    websocketUrl,
    stunServers: stunServers.length > 0 ? stunServers : ["stun:stun.l.google.com:19302"],
    turnServers,
  });
});

export default router;
