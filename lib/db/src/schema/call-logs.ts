import { pgTable, uuid, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { users } from "./users";

export const callLogs = pgTable("call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  callerId: varchar("caller_id", { length: 64 })
    .notNull()
    .references(() => users.id),
  calleeId: varchar("callee_id", { length: 64 })
    .notNull()
    .references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationS: integer("duration_s"),
});

export type CallLog = typeof callLogs.$inferSelect;
