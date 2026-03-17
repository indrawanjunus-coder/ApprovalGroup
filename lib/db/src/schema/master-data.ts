import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
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

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPrTypeSchema = createInsertSchema(prTypesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Department = typeof departmentsTable.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type PrType = typeof prTypesTable.$inferSelect;
export type InsertPrType = z.infer<typeof insertPrTypeSchema>;
