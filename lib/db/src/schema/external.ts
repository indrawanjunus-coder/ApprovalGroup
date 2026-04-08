import { pgTable, serial, text, integer, boolean, bigint, numeric } from "drizzle-orm/pg-core";

export const vendorCompaniesTable = pgTable("vendor_companies", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyAddress: text("company_address").notNull(),
  picName: text("pic_name").notNull(),
  picPhone: text("pic_phone").notNull(),
  officePhone: text("office_phone").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  ktpAttachment: text("ktp_attachment"),
  ktpFilename: text("ktp_filename"),
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankAccountName: text("bank_account_name"),
  status: text("status").notNull().default("pending"),
  authCode: text("auth_code"),
  authCodeExpiresAt: bigint("auth_code_expires_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const vendorInvoicesTable = pgTable("vendor_invoices", {
  id: serial("id").primaryKey(),
  vendorCompanyId: integer("vendor_company_id").notNull(),
  companyName: text("company_name").notNull(),
  poNumber: text("po_number").notNull(),
  picName: text("pic_name").notNull(),
  picPhone: text("pic_phone").notNull(),
  totalInvoice: text("total_invoice").notNull(),
  attachment: text("attachment"),
  attachmentFilename: text("attachment_filename"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  statusChangedBy: text("status_changed_by"),
  statusChangedAt: bigint("status_changed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
});

export const externalUsersTable = pgTable("external_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const masterUomsTable = pgTable("master_uoms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const masterItemsTable = pgTable("master_items", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  defaultUomId: integer("default_uom_id"),
  category: text("category"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }),
});

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: text("permissions").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
});

export const vendorInvoiceItemsTable = pgTable("vendor_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  itemId: integer("item_id").notNull(),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  uomId: integer("uom_id").notNull(),
  uomName: text("uom_name").notNull(),
  qty: numeric("qty", { precision: 18, scale: 4 }).notNull(),
  pricePerUom: numeric("price_per_uom", { precision: 18, scale: 2 }).notNull(),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }).notNull(),
});

export const vendorBankChangeRequestsTable = pgTable("vendor_bank_change_requests", {
  id: serial("id").primaryKey(),
  vendorCompanyId: integer("vendor_company_id").notNull(),
  vendorCompanyName: text("vendor_company_name").notNull(),
  bankName: text("bank_name").notNull(),
  bankAccount: text("bank_account").notNull(),
  bankAccountName: text("bank_account_name").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: bigint("reviewed_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
