import { createHmac } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

/**
 * Parse a comma-separated or JSON-array env var into a list of URL strings.
 * Handles both plain strings ("turn:host:3478") and JSON arrays
 * (["turn:host:3478"] or [{"urls":"turn:..."}]).
 */
function parseTurnUrls(envVar: string | undefined): string[] {
  if (!envVar) return [];
  try {
    const parsed: unknown = JSON.parse(envVar);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null && "urls" in item) {
            return String((item as Record<string, unknown>)["urls"]);
          }
          return null;
        })
        .filter((s): s is string => Boolean(s));
    }
  } catch {
    // not JSON — treat as comma-separated
  }
  return envVar.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Generate time-limited HMAC-SHA1 credentials for coturn's static-auth-secret
 * mechanism (RFC 5766 §10 / coturn `use-auth-secret`).
 *
 *   username  = "<unix_timestamp_expiry>:messenger"
 *   credential = base64( HMAC-SHA1( secret, username ) )
 *
 * TTL: 24 h from the moment this endpoint is called.  The client caches the
 * config and reuses the same token until it refreshes; 24 h is generous enough
 * for any reasonable session lifetime.
 */
function generateTurnCredentials(secret: string): { username: string; credential: string } {
  const expiry = Math.floor(Date.now() / 1000) + 86_400; // now + 24 h
  const username = `${expiry}:messenger`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

// GET /api/v1/config
router.get("/", (_req: Request, res: Response): void => {
  const websocketUrl = process.env["WEBSOCKET_URL"] ?? "";
  const version = process.env["APP_VERSION"] ?? "1.0";

  // ── STUN ─────────────────────────────────────────────────────────────────
  const stunUrls = parseTurnUrls(process.env["STUN_SERVERS"]);
  const stunServers = stunUrls.length > 0 ? stunUrls : ["stun:stun.l.google.com:19302"];

  // ── TURN ─────────────────────────────────────────────────────────────────
  // When TURN_SECRET is present, attach HMAC-SHA1 time-limited credentials so
  // coturn's `use-auth-secret` mode can authenticate the relay request.
  // Without credentials the coturn server rejects the allocation request and
  // the client silently falls back to STUN-only (or direct P2P), which fails
  // behind carrier-grade NAT.
  const turnSecret = process.env["TURN_SECRET"];
  const turnUrls = parseTurnUrls(process.env["TURN_SERVERS"]);

  type TurnServer = { urls: string; username?: string; credential?: string };
  let turnServers: TurnServer[] = [];

  if (turnUrls.length > 0) {
    if (turnSecret) {
      const { username, credential } = generateTurnCredentials(turnSecret);
      turnServers = turnUrls.map((urls) => ({ urls, username, credential }));
    } else {
      // No secret configured — return bare URLs (dev / no-TURN environment).
      turnServers = turnUrls.map((urls) => ({ urls }));
    }
  }

  res.json({ version, websocketUrl, stunServers, turnServers });
});

export default router;
