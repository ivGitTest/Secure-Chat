# ============================================================
# Stage 1: builder — installs deps and builds the application
# ============================================================
FROM node:22-slim AS builder
WORKDIR /monorepo

# Install pnpm at the exact same version used in the monorepo dev environment.
# Do NOT use corepack here — without a packageManager field in package.json,
# corepack resolves the latest pnpm release (currently 11.x), which has a
# breaking build-approval API incompatible with this lockfile (v9, pnpm 10).
RUN npm install -g pnpm@10.26.1 --no-update-notifier

# Copy workspace manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copy all workspace packages required by the monorepo build
COPY lib/       ./lib/
COPY scripts/   ./scripts/
COPY artifacts/api-server/ ./artifacts/api-server/

# Copy the migration source (will be bundled separately below)
COPY deploy/api/migrate.ts ./deploy/api/migrate.ts

# Install ALL dependencies (dev included — esbuild is needed for build)
RUN pnpm install --no-frozen-lockfile

# Build the API server bundle → artifacts/api-server/dist/
RUN pnpm --filter @workspace/api-server run build

# Bundle migrate + admin via package scripts (paths are relative to the api-server package dir)
RUN pnpm --filter @workspace/api-server run bundle-migrate
RUN pnpm --filter @workspace/api-server run bundle-admin

# Copy argon2 AND all its runtime deps from the pnpm virtual store.
# pnpm stores a package's deps as siblings in .pnpm/<pkg>/node_modules/:
#   argon2/, @phc/format, node-addon-api, node-gyp-build — all needed at runtime.
RUN cp -rL node_modules/.pnpm/argon2@*/node_modules /tmp/argon2_deps

# firebase-admin is externalized by esbuild (it pulls in @google-cloud/* which
# can be tricky to bundle).  Install it separately in a temp dir so we can copy
# its full node_modules tree into the runner image.
RUN mkdir /tmp/fb_admin \
 && cd /tmp/fb_admin \
 && npm init -y \
 && npm install firebase-admin@'^13.0.0' --no-package-lock --loglevel error

# ============================================================
# Stage 2: runner — minimal production image
# ============================================================
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a dedicated non-root user (principle of least privilege)
RUN groupadd --gid 1001 nodejs \
 && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false nodejs

# Bundle contains everything except argon2 (externalized native module)
COPY --from=builder /monorepo/artifacts/api-server/dist/ ./dist/

# argon2 + its runtime deps (resolved from pnpm virtual store, no dangling symlinks)
COPY --from=builder /tmp/argon2_deps/ ./node_modules/

# firebase-admin + its deps (externalized from esbuild bundle, installed in builder)
COPY --from=builder /tmp/fb_admin/node_modules/ ./node_modules/

# Entrypoint: run migrations then exec the API server
COPY deploy/api/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh \
 && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
