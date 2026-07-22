import { pgTable, varchar, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const users = pgTable("users", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: text("name").notNull(),
  pinHash: text("pin_hash").notNull(),
  isBlocked: boolean("is_blocked").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  createdAt: true,
  failedAttempts: true,
  isBlocked: true,
});

export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
