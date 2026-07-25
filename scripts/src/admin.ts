/**
 * Admin CLI for messenger user management.
 *
 * Usage:
 *   DATABASE_URL=<url> pnpm --filter @workspace/scripts run admin -- <command> [options]
 *
 * Commands:
 *   create-user --id <userId> --name <name> --pin <6-digit-pin>
 *   block-user --id <userId>
 *   unblock-user --id <userId>
 *   list-users
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import argon2 from "argon2";
import * as schema from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const { Pool } = pg;

function getDb(): ReturnType<typeof drizzle> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL environment variable is required.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg !== undefined && arg.startsWith("--") && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        args.set(arg.slice(2), next);
        i++;
      }
    }
  }
  return args;
}

async function createUser(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  const name = args.get("name");
  const pin = args.get("pin");

  if (!id || !name || !pin) {
    console.error("Usage: create-user --id <userId> --name <name> --pin <6-digit-pin>");
    process.exit(1);
  }

  if (!/^\d{6}$/.test(pin)) {
    console.error("Error: PIN must be exactly 6 digits.");
    process.exit(1);
  }

  const db = getDb();
  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });

  await db.insert(schema.users).values({ id, name, pinHash });
  console.log(`User '${id}' (${name}) created successfully.`);
}

async function blockUser(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  if (!id) {
    console.error("Usage: block-user --id <userId>");
    process.exit(1);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (!user) {
    console.error(`Error: User '${id}' not found.`);
    process.exit(1);
  }

  await db
    .update(schema.users)
    .set({ isBlocked: true, failedAttempts: 0 })
    .where(eq(schema.users.id, id));

  console.log(`User '${id}' blocked.`);
}

async function unblockUser(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  if (!id) {
    console.error("Usage: unblock-user --id <userId>");
    process.exit(1);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (!user) {
    console.error(`Error: User '${id}' not found.`);
    process.exit(1);
  }

  await db
    .update(schema.users)
    .set({ isBlocked: false, failedAttempts: 0 })
    .where(eq(schema.users.id, id));

  console.log(`User '${id}' unblocked.`);
}

async function changePin(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  const pin = args.get("pin");

  if (!id || !pin) {
    console.error("Usage: change-pin --id <userId> --pin <6-digit-pin>");
    process.exit(1);
  }

  if (!/^\d{6}$/.test(pin)) {
    console.error("Error: PIN must be exactly 6 digits.");
    process.exit(1);
  }

  const db = getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (!user) {
    console.error(`Error: User '${id}' not found.`);
    process.exit(1);
  }

  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
  await db
    .update(schema.users)
    .set({ pinHash, failedAttempts: 0, isBlocked: false })
    .where(eq(schema.users.id, id));

  console.log(`PIN for user '${id}' changed successfully.`);
}

async function listUsers(): Promise<void> {
  const db = getDb();
  const allUsers = await db
    .select({ id: schema.users.id, name: schema.users.name, isBlocked: schema.users.isBlocked, failedAttempts: schema.users.failedAttempts })
    .from(schema.users);

  if (allUsers.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log("Users:");
  for (const user of allUsers) {
    const status = user.isBlocked ? "[BLOCKED]" : "[active]";
    console.log(`  ${status} ${user.id} (${user.name}) — failed_attempts: ${user.failedAttempts}`);
  }
}

async function main(): Promise<void> {
  // Skip the '--' separator that pnpm injects when passing args via `run script -- args`
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  switch (command) {
    case "create-user":
      await createUser(args);
      break;
    case "block-user":
      await blockUser(args);
      break;
    case "unblock-user":
      await unblockUser(args);
      break;
    case "list-users":
      await listUsers();
      break;
    case "change-pin":
      await changePin(args);
      break;
    default:
      console.error(`Unknown command: '${command ?? ""}'`);
      console.error("Available commands: create-user, block-user, unblock-user, list-users");
      process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
