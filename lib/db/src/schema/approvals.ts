import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalsTable = pgTable("approvals", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id").notNull(),
  approverId: integer("approver_id").notNull(),
  level: integer("level").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  actionAt: timestamp("action_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const approvalRulesTable = pgTable("approval_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyId: integer("company_id"),
  department: text("department"),
  type: text("type").notNull().default("purchase"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const approvalRuleLevelsTable = pgTable("approval_rule_levels", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull(),
  level: integer("level").notNull(),
  approverId: integer("approver_id").notNull(),
  minAmount: numeric("min_amount", { precision: 15, scale: 2 }),
  maxAmount: numeric("max_amount", { precision: 15, scale: 2 }),
});

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({
  id: true,
  createdAt: true,
});

export const insertApprovalRuleSchema = createInsertSchema(approvalRulesTable).omit({
  id: true,
  createdAt: true,
});

export const insertApprovalRuleLevelSchema = createInsertSchema(approvalRuleLevelsTable).omit({
  id: true,
});

export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
export type ApprovalRule = typeof approvalRulesTable.$inferSelect;
export type ApprovalRuleLevel = typeof approvalRuleLevelsTable.$inferSelect;
