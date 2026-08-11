---
name: EAS Firebase config
description: EAS cloud builds receive the Firebase config through an environment secret because google-services.json is gitignored.
---

`google-services.json` is intentionally excluded from git, so EAS Cloud cannot read the local file during prebuild. The project config must declare `android.googleServicesFile` and create the file from `GOOGLE_SERVICES_JSON` when that environment variable is present. The EAS project secret is created once with `pnpm dlx eas-cli@latest secret:create`.

**Why:** EAS only uploads git-tracked project files to cloud builds; a local ignored file is not available there.

**How to apply:** Keep the one-time secret setup documented in `deploy/README.md`; do not ask for the file again if it already exists locally.