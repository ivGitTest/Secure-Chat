/**
 * Production database migration script.
 * Bundled with esbuild during Docker build → dist/migrate.mjs (self-contained, no external deps).
 * Runs before the API server starts to ensure the schema is up to date.
 *
 * Idempotent: all statements use CREATE TABLE IF NOT EXISTS.
 */
import pg from "pg";

const { Pool } = pg;

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id              VARCHAR(64)  PRIMARY KEY,
  name            TEXT         NOT NULL,
  pin_hash        TEXT         NOT NULL,
  is_blocked      BOOLEAN      NOT NULL DEFAULT FALSE,
  failed_attempts INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id     TEXT         NOT NULL,
  registered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participants (
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       VARCHAR(64)  NOT NULL REFERENCES users(id),
  text            TEXT         NOT NULL,
  client_id       TEXT         UNIQUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Idempotent backfill: add client_id to existing tables created before this column existed
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS call_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id   VARCHAR(64)  NOT NULL REFERENCES users(id),
  callee_id   VARCHAR(64)  NOT NULL REFERENCES users(id),
  started_at  TIMESTAMPTZ  NOT NULL,
  ended_at    TIMESTAMPTZ,
  duration_s  INTEGER
);

-- Push token registry: one row per user (last registered device wins).
-- Used by the API server to reach users who are offline via Expo Push Service → FCM.
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    VARCHAR(64)  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
`;

try {
  await pool.query(SQL);
  console.log("[migrate] Schema applied successfully");
} catch (err) {
  console.error("[migrate] Failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
