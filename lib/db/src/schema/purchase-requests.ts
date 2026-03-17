import { pgTable, serial, text, integer, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const purchaseRequestsTable = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  prNumber: text("pr_number").notNull().unique(),
  date: timestamp("date").notNull().defaultNow(),
  requesterId: integer("requester_id").notNull(),
  department: text("department").notNull(),
  companyId: integer("company_id"),
  type: text("type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  attachmentUrl: text("attachment_url"),
  currentApprovalLevel: integer("current_approval_level"),
  notes: text("notes"),
  leaveStartDate: date("leave_start_date"),
  leaveEndDate: date("leave_end_date"),
  leaveRequesterId: integer("leave_requester_id"),
  selectedVendorId: integer("selected_vendor_id"),
  vendorSelectedBy: integer("vendor_selected_by"),
  vendorSelectedAt: timestamp("vendor_selected_at"),
  vendorFinalQty: numeric("vendor_final_qty", { precision: 15, scale: 2 }),
  vendorFinalAmount: numeric("vendor_final_amount", { precision: 15, scale: 2 }),
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

export const prVendorAttachmentsTable = pgTable("pr_vendor_attachments", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  fileUrl: text("file_url").notNull(),
  quotedPrice: numeric("quoted_price", { precision: 15, scale: 2 }),
  notes: text("notes"),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPRSchema = createInsertSchema(purchaseRequestsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export const insertPRItemSchema = createInsertSchema(prItemsTable).omit({
  id: true, createdAt: true,
});

export const insertPRVendorAttachmentSchema = createInsertSchema(prVendorAttachmentsTable).omit({
  id: true, createdAt: true,
});

export type InsertPR = z.infer<typeof insertPRSchema>;
export type PR = typeof purchaseRequestsTable.$inferSelect;
export type InsertPRItem = z.infer<typeof insertPRItemSchema>;
export type PRItem = typeof prItemsTable.$inferSelect;
export type PRVendorAttachment = typeof prVendorAttachmentsTable.$inferSelect;
