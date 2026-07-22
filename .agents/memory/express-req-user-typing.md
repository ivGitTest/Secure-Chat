---
name: Express req.user typing pattern
description: How to add typed user property to Express Request in this project
---

To add `req.user` typing in the api-server artifact:

1. Add `"express"` to `"types"` array in `artifacts/api-server/tsconfig.json` — this loads the global `Express` namespace from @types/express.

2. Create an ambient declaration file (e.g. `src/types/express.d.ts`) with NO imports:
```typescript
declare namespace Express {
  interface Request {
    user?: { userId: string; sessionId: string; };
  }
}
```

**Why:** `declare module "express-serve-static-core"` does NOT work — the module path is not resolvable. The global `Express` namespace only exists when `"express"` is in the tsconfig `"types"` array. Without it, `@types/express` globals are excluded because the base tsconfig uses `"types": ["node"]`.

**How to apply:** Any future property additions to Request should follow this same pattern.
