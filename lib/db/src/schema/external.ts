import { pgTable, serial, text, integer, boolean, bigint } from "drizzle-orm/pg-core";

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
