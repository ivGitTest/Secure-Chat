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

# Extract argon2 native module (follow pnpm symlinks → actual files, no dangling symlinks)
RUN cp -rL node_modules/argon2 /tmp/argon2

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

# argon2 must be present as a real directory (not a symlink) for Node.js to find it
COPY --from=builder /tmp/argon2/ ./node_modules/argon2/

# Entrypoint: run migrations then exec the API server
COPY deploy/api/entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh \
 && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
