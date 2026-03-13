import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  prNumber: text("pr_number").notNull().unique(),
  date: timestamp("date").notNull().defaultNow(),
  requesterId: integer("requester_id").notNull(),
  department: text("department").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  attachmentUrl: text("attachment_url"),
  currentApprovalLevel: integer("current_approval_level"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const prItemsTable = pgTable("pr_items", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  qty: numeric("qty", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  estimatedPrice: numeric("estimated_price", { precision: 15, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPRSchema = createInsertSchema(purchaseRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPRItemSchema = createInsertSchema(prItemsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPR = z.infer<typeof insertPRSchema>;
export type PR = typeof purchaseRequestsTable.$inferSelect;
export type InsertPRItem = z.infer<typeof insertPRItemSchema>;
export type PRItem = typeof prItemsTable.$inferSelect;
