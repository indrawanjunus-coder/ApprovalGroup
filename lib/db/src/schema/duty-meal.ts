import { pgTable, serial, integer, text, boolean, numeric, timestamp, date } from "drizzle-orm/pg-core";

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dutyMealPlafonTable = pgTable("duty_meal_plafon", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  positionName: text("position_name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dutyMealsTable = pgTable("duty_meals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  companyId: integer("company_id"),
  brandId: integer("brand_id"),
  mealMonth: text("meal_month").notNull(),
  mealDate: date("meal_date").notNull(),
  totalBillBeforeTax: numeric("total_bill_before_tax", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  receiptData: text("receipt_data"),
  receiptFilename: text("receipt_filename"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dutyMealMonthlyPaymentsTable = pgTable("duty_meal_monthly_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  companyId: integer("company_id"),
  mealMonth: text("meal_month").notNull(),
  proofData: text("proof_data"),
  proofFilename: text("proof_filename"),
  gdriveFileId: text("gdrive_file_id"),
  gdriveFileUrl: text("gdrive_file_url"),
  overAmount: numeric("over_amount", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
