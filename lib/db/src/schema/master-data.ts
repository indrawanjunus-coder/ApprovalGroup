import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const prTypesTable = pgTable("pr_types", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  companyId: integer("company_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPrTypeSchema = createInsertSchema(prTypesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertLocationSchema = createInsertSchema(locationsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Department = typeof departmentsTable.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type PrType = typeof prTypesTable.$inferSelect;
export type InsertPrType = z.infer<typeof insertPrTypeSchema>;
export type Location = typeof locationsTable.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
