import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const prReceivingItemsTable = pgTable("pr_receiving_items", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id").notNull(),
  prItemId: integer("pr_item_id").notNull(),
  receivedQty: numeric("received_qty", { precision: 15, scale: 2 }).notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  receivedBy: integer("received_by").notNull(),
  notes: text("notes"),
});

export type PRReceivingItem = typeof prReceivingItemsTable.$inferSelect;
