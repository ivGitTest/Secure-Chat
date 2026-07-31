import { pgTable, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Stores the last known push tokens for each user.
 * Primary key is userId — one row per user (last registered device wins).
 * Tokens are updated on every app launch; old tokens are replaced in-place.
 *
 * token    — Expo push token (ExponentPushToken[...]) — used for message pushes
 * fcmToken — raw FCM registration token                — used for VoIP call pushes
 *            (data-only, high-priority, bypasses Expo Push Service)
 */
export const pushTokens = pgTable("push_tokens", {
  userId: varchar("user_id", { length: 64 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  fcmToken: text("fcm_token"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushToken = typeof pushTokens.$inferSelect;
