---
name: JWT signing key
description: How JWT secret is resolved; SESSION_SECRET is the available Replit secret
---

The Replit environment only has SESSION_SECRET configured as a secret (not JWT_SECRET).
The getJwtSecret() helper in both auth.ts and middlewares/auth.ts falls back:

```typescript
const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
```

**Why:** JWT_SECRET was not provisioned as a Replit secret when the server was built. Rather than blocking on secret setup, SESSION_SECRET (already available) is used as the signing key.

**How to apply:** If JWT_SECRET is later added as a proper Replit secret, the fallback still works. For production, add JWT_SECRET via the environment-secrets skill.
