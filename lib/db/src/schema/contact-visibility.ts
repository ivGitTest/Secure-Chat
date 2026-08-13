import { pgTable, varchar, primaryKey, index } from "drizzle-orm/pg-core";
import { users } from "./users";

// This is a symmetric deny list: each stored pair is hidden in both directions.
// No row means the users can see each other.
export const contactVisibility = pgTable(
  "contact_visibility",
  {
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibleUserId: varchar("visible_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.visibleUserId] }),
    index("contact_visibility_visible_user_id_idx").on(table.visibleUserId),
  ],
);

export type ContactVisibility = typeof contactVisibility.$inferSelect;