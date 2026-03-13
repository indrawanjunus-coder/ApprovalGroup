import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userCompaniesTable = pgTable("user_companies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  companyId: text("company_id").notNull(),
  department: text("department").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserCompanySchema = createInsertSchema(userCompaniesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
export type InsertUserCompany = z.infer<typeof insertUserCompanySchema>;
export type UserCompany = typeof userCompaniesTable.$inferSelect;
