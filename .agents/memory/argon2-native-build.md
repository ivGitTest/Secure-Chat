---
name: argon2 native module setup
description: argon2 requires native build step — must be in onlyBuiltDependencies
---

`argon2` is a native Node.js addon. In this pnpm workspace it requires:

1. Add `argon2` to `onlyBuiltDependencies` in `pnpm-workspace.yaml`
2. Add `argon2` to `dependencies` in the consuming package's `package.json`
3. In `build.mjs` (esbuild config) it is listed in `external: ["argon2", ...]` so it is NOT bundled and loads from `node_modules` at runtime

**Why:** Native addons cannot be bundled by esbuild. The `onlyBuiltDependencies` list tells pnpm to run the native build script during install.

**How to apply:** Same pattern applies to any other native addon (e.g. `better-sqlite3`).
