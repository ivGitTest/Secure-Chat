---
name: firebase-admin ESM/CJS import fix
description: How to import firebase-admin v11+ in an esbuild-bundled Node.js server without credential being undefined.
---

# firebase-admin v11+ with esbuild — use subpackage imports

## The rule
Never use `import * as admin from "firebase-admin"` in an esbuild-bundled TypeScript server. Use the modular subpackage imports instead.

```typescript
// ❌ WRONG — admin.credential is undefined at runtime when bundled by esbuild
import * as admin from "firebase-admin";
admin.credential.cert(serviceAccount);
admin.initializeApp({ credential: ... });
admin.messaging(app).send({ ... });

// ✅ CORRECT — modular API, works with esbuild
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
cert(serviceAccount);
initializeApp({ credential: cert(serviceAccount) });
getMessaging(app).send({ ... });
```

**Why:** firebase-admin v11+ ships a modular API. The barrel `"firebase-admin"` package does not re-export `credential` as a named ESM binding that esbuild can resolve from its CJS source. `import * as` produces a namespace object where `credential` is `undefined`. The subpackage paths (`firebase-admin/app`, `firebase-admin/messaging`) expose proper CJS entry points that esbuild handles correctly.

**How to apply:** Any time firebase-admin is used in an esbuild-bundled server (the api-server uses `build.mjs` with esbuild), import from the specific subpackages, not the barrel.
