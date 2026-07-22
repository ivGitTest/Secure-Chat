---
name: drizzle-zod custom schema overrides
description: Do not pass custom Zod overrides to createInsertSchema — causes type errors
---

Calling `createInsertSchema(table, { field: z.string().min(1) })` causes a TypeScript error:
```
Type 'ZodString' is not assignable to type 'ZodType<unknown, unknown, $ZodTypeInternals<...>>'
```

This is due to an internal Zod version mismatch between what drizzle-zod expects and the workspace's `zod` package.

**Why:** The catalog pins `zod: ^3.25.76` but drizzle-zod's internal override types reference Zod v4 internals (`$ZodTypeInternals`).

**How to apply:** Use `createInsertSchema(table).omit({...})` to drop unwanted fields instead of passing override schemas. Do all extra validation in route handlers.
