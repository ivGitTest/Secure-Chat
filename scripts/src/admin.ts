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
 *   link-users --a <userId> --b <userId>       # make mutually visible
 *   unlink-users --a <userId> --b <userId>     # hide mutually
 *   list-visibility
 *   show-contacts --id <userId>
 *   reset-visibility --id <userId>
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import argon2 from "argon2";
import * as schema from "@workspace/db/schema";
import { and, asc, eq, ne, notExists, or } from "drizzle-orm";

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

async function requireUser(db: ReturnType<typeof drizzle>, id: string, label = "User") {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);

  if (!user) {
    throw new Error(`${label} '${id}' not found.`);
  }

  return user;
}

function getVisibilityPair(
  args: Map<string, string>,
  command: "link-users" | "unlink-users",
): { a: string; b: string } {
  const a = args.get("a");
  const b = args.get("b");

  if (!a || !b) {
    throw new Error(`Usage: ${command} --a <userId> --b <userId>`);
  }
  if (a === b) {
    throw new Error("A user cannot be linked to themselves.");
  }

  return { a, b };
}

async function linkUsers(args: Map<string, string>): Promise<void> {
  const { a, b } = getVisibilityPair(args, "link-users");
  const db = getDb();
  await requireUser(db, a, "User A");
  await requireUser(db, b, "User B");

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.contactVisibility)
      .where(
        or(
          and(eq(schema.contactVisibility.userId, a), eq(schema.contactVisibility.visibleUserId, b)),
          and(eq(schema.contactVisibility.userId, b), eq(schema.contactVisibility.visibleUserId, a)),
        ),
      );
  });

  console.log(`Users '${a}' and '${b}' are now mutually visible.`);
}

async function unlinkUsers(args: Map<string, string>): Promise<void> {
  const { a, b } = getVisibilityPair(args, "unlink-users");
  const db = getDb();
  await requireUser(db, a, "User A");
  await requireUser(db, b, "User B");

  await db.transaction(async (tx) => {
    await tx
      .insert(schema.contactVisibility)
      .values([
        { userId: a, visibleUserId: b },
        { userId: b, visibleUserId: a },
      ])
      .onConflictDoNothing();
  });

  console.log(`Users '${a}' and '${b}' are now hidden from each other.`);
}

async function listVisibility(): Promise<void> {
  const db = getDb();
  const allUsers = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
    })
    .from(schema.users)
    .orderBy(asc(schema.users.id));
  const hiddenPairs = await db
    .select({
      userId: schema.contactVisibility.userId,
      visibleUserId: schema.contactVisibility.visibleUserId,
    })
    .from(schema.contactVisibility);
  const hiddenPairKeys = new Set(
    hiddenPairs.map((pair) => [pair.userId, pair.visibleUserId].sort().join("\u0000")),
  );
  console.log("Visible pairs (users who see each other):");
  let hasVisiblePairs = false;
  let hasPrintedUserGroup = false;

  for (const userA of allUsers) {
    const visibleContacts = allUsers.filter(
      (userB) =>
        userB.id !== userA.id &&
        !hiddenPairKeys.has([userA.id, userB.id].sort().join("\u0000")),
    );

    if (visibleContacts.length === 0) continue;

    if (hasPrintedUserGroup) {
      console.log("------------------------------");
    }

    for (const userB of visibleContacts) {
      console.log(`  ${userA.id} (${userA.name}) ↔ ${userB.id} (${userB.name})`);
    }

    hasPrintedUserGroup = true;
    hasVisiblePairs = true;
  }

  if (!hasVisiblePairs) {
    console.log("No visible pairs found.");
  }
}

async function showContacts(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  if (!id) {
    throw new Error("Usage: show-contacts --id <userId>");
  }

  const db = getDb();
  const user = await requireUser(db, id);
  const hiddenPair = db
    .select({ userId: schema.contactVisibility.userId })
    .from(schema.contactVisibility)
    .where(
      or(
        and(
          eq(schema.contactVisibility.userId, id),
          eq(schema.contactVisibility.visibleUserId, schema.users.id),
        ),
        and(
          eq(schema.contactVisibility.userId, schema.users.id),
          eq(schema.contactVisibility.visibleUserId, id),
        ),
      ),
    );
  const contacts = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(ne(schema.users.id, id), notExists(hiddenPair)))
    .orderBy(asc(schema.users.id));

  if (contacts.length === 0) {
    console.log(`${user.id} (${user.name}) has no visible contacts.`);
    return;
  }

  console.log(`${user.id} (${user.name}) sees:`);
  for (const contact of contacts.filter((contact) => contact.id !== id)) {
    console.log(`  ${contact.id} (${contact.name})`);
  }
}

async function resetVisibility(args: Map<string, string>): Promise<void> {
  const id = args.get("id");
  if (!id) {
    throw new Error("Usage: reset-visibility --id <userId>");
  }

  const db = getDb();
  await requireUser(db, id);
  const deleted = await db
    .delete(schema.contactVisibility)
    .where(
      or(
        eq(schema.contactVisibility.userId, id),
        eq(schema.contactVisibility.visibleUserId, id),
      ),
    )
    .returning({ userId: schema.contactVisibility.userId });

  console.log(
    deleted.length === 0
      ? `No visibility restrictions found for '${id}'.`
      : `Removed ${deleted.length} visibility direction(s) involving '${id}'. '${id}' now sees all users.`,
  );
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
    case "link-users":
      await linkUsers(args);
      break;
    case "unlink-users":
      await unlinkUsers(args);
      break;
    case "list-visibility":
      await listVisibility();
      break;
    case "show-contacts":
      await showContacts(args);
      break;
    case "reset-visibility":
      await resetVisibility(args);
      break;
    default:
      console.error(`Unknown command: '${command ?? ""}'`);
      console.error(
        "Available commands: create-user, block-user, unblock-user, change-pin, list-users, link-users, unlink-users, list-visibility, show-contacts, reset-visibility",
      );
      process.exit(1);
  }
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
