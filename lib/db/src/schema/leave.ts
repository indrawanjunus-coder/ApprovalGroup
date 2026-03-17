import { pgTable, serial, integer, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userLeaveBalancesTable = pgTable("user_leave_balances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  year: integer("year").notNull(),
  balanceDays: numeric("balance_days", { precision: 5, scale: 1 }).notNull().default("0"),
  carriedOverDays: numeric("carried_over_days", { precision: 5, scale: 1 }).notNull().default("0"),
  carriedOverExpiry: date("carried_over_expiry"),
  usedDays: numeric("used_days", { precision: 5, scale: 1 }).notNull().default("0"),
  lastAccumulatedMonth: integer("last_accumulated_month").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const companyLeaveSettingsTable = pgTable("company_leave_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique(),
  carryoverExpiryMonth: integer("carryover_expiry_month").notNull().default(3),
  carryoverExpiryDay: integer("carryover_expiry_day").notNull().default(31),
  maxCarryoverDays: integer("max_carryover_days").notNull().default(12),
  accrualDaysPerMonth: numeric("accrual_days_per_month", { precision: 4, scale: 2 }).notNull().default("1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type UserLeaveBalance = typeof userLeaveBalancesTable.$inferSelect;
export type CompanyLeaveSetting = typeof companyLeaveSettingsTable.$inferSelect;
