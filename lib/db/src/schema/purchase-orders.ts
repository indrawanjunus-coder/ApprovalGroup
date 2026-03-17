import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  prId: integer("pr_id").notNull(),
  supplier: text("supplier").notNull(),
  status: text("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdById: integer("created_by_id").notNull(),
  issuedAt: timestamp("issued_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const poItemsTable = pgTable("po_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull(),
  prItemId: integer("pr_item_id"),
  name: text("name").notNull(),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  negotiatedPrice: numeric("negotiated_price", { precision: 15, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPOSchema = createInsertSchema(purchaseOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPOItemSchema = createInsertSchema(poItemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPO = z.infer<typeof insertPOSchema>;
export type PO = typeof purchaseOrdersTable.$inferSelect;
export type InsertPOItem = z.infer<typeof insertPOItemSchema>;
export type POItem = typeof poItemsTable.$inferSelect;
