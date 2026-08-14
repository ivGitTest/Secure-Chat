import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";
import { users } from "./users";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id", { length: 64 })
    .notNull()
    .references(() => users.id),
  text: text("text").notNull(),
  /**
   * Client-generated idempotency key (UUID). When provided, the server will
   * not insert a duplicate if the same clientId is received again (e.g. after
   * a reconnect or a double-tap). Nullable for backwards compatibility.
   */
  clientId: text("client_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Set when the recipient's device acknowledges receipt via message.ack WS event.
   * Null means the message has not yet been delivered to the recipient's device.
   */
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export type Message = typeof messages.$inferSelect;
