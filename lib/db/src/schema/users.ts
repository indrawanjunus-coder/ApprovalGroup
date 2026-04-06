import { pgTable, serial, text, boolean, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  department: text("department").notNull(),
  position: text("position").notNull(),
  role: text("role").notNull().default("user"),
  superiorId: integer("superior_id"),
  hiredCompanyId: integer("hired_company_id"),
  joinDate: date("join_date"),
  leaveAccrualStartMonth: integer("leave_accrual_start_month"),
  signature: text("signature"),
  enableDutyMeal: boolean("enable_duty_meal").notNull().default(true),
  enablePembayaran: boolean("enable_pembayaran").notNull().default(true),
  enablePurchaseRequest: boolean("enable_purchase_request").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
