import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Stores the last known Expo push token for each user.
 * Primary key is userId — one token per user (last registered device wins).
 * Token is updated on every app launch; old tokens are replaced in-place.
 */
export const pushTokens = pgTable("push_tokens", {
  userId: varchar("user_id", { length: 64 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushToken = typeof pushTokens.$inferSelect;
