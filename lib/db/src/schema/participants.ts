import { pgTable, uuid, varchar, primaryKey } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { users } from "./users";

export const participants = pgTable(
  "participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export type Participant = typeof participants.$inferSelect;
