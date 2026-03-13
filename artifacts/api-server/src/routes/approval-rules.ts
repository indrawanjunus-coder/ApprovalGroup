import { Router } from "express";
import { db } from "@workspace/db";
import { approvalRulesTable, approvalRuleLevelsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const rules = await db.select().from(approvalRulesTable);
    const ruleIds = rules.map(r => r.id);
    const levels = ruleIds.length > 0
      ? await db.select().from(approvalRuleLevelsTable).where(inArray(approvalRuleLevelsTable.ruleId, ruleIds))
      : [];
    const result = rules.map(r => ({
      ...r,
      minAmount: parseFloat(r.minAmount),
      maxAmount: r.maxAmount ? parseFloat(r.maxAmount) : null,
      levels: levels.filter(l => l.ruleId === r.id),
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { name, minAmount, maxAmount, levels } = req.body;
  if (!name || minAmount === undefined || !levels || !Array.isArray(levels)) {
    res.status(400).json({ error: "Bad Request" }); return;
  }
  try {
    const [rule] = await db.insert(approvalRulesTable).values({
      name,
      minAmount: minAmount.toString(),
      maxAmount: maxAmount?.toString() || null,
    }).returning();
    const ruleLevels = levels.length > 0
      ? await db.insert(approvalRuleLevelsTable).values(
          levels.map((l: any) => ({ ruleId: rule.id, level: l.level, role: l.role, position: l.position || null }))
        ).returning()
      : [];
    await createAuditLog(req.user!.id, "create_approval_rule", "approval", rule.id);
    res.status(201).json({ ...rule, minAmount: parseFloat(rule.minAmount), maxAmount: rule.maxAmount ? parseFloat(rule.maxAmount) : null, levels: ruleLevels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, minAmount, maxAmount, levels } = req.body;
  try {
    const [rule] = await db.update(approvalRulesTable).set({
      name,
      minAmount: minAmount.toString(),
      maxAmount: maxAmount?.toString() || null,
    }).where(eq(approvalRulesTable.id, id)).returning();
    if (!rule) { res.status(404).json({ error: "Not Found" }); return; }
    await db.delete(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, id));
    const ruleLevels = levels?.length > 0
      ? await db.insert(approvalRuleLevelsTable).values(
          levels.map((l: any) => ({ ruleId: id, level: l.level, role: l.role, position: l.position || null }))
        ).returning()
      : [];
    res.json({ ...rule, minAmount: parseFloat(rule.minAmount), maxAmount: rule.maxAmount ? parseFloat(rule.maxAmount) : null, levels: ruleLevels });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.delete(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, id));
    await db.delete(approvalRulesTable).where(eq(approvalRulesTable.id, id));
    res.json({ success: true, message: "Rule deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
