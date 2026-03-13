import { Router } from "express";
import { db } from "@workspace/db";
import { approvalRulesTable, approvalRuleLevelsTable, usersTable, companiesTable } from "@workspace/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

async function enrichRules(rules: any[]) {
  if (rules.length === 0) return [];
  const ruleIds = rules.map(r => r.id);
  const levels = await db.select().from(approvalRuleLevelsTable).where(inArray(approvalRuleLevelsTable.ruleId, ruleIds));

  const approverIds = [...new Set(levels.filter(l => l.approverId).map(l => l.approverId!))];
  const approvers = approverIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
    : [];
  const approverMap = new Map(approvers.map(a => [a.id, a.name]));

  const companyIds = [...new Set(rules.filter(r => r.companyId).map(r => r.companyId!))];
  const companies = companyIds.length > 0
    ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, companyIds))
    : [];
  const companyMap = new Map(companies.map(c => [c.id, c.name]));

  return rules.map(r => ({
    ...r,
    companyName: r.companyId ? companyMap.get(r.companyId) || null : null,
    levels: levels
      .filter(l => l.ruleId === r.id)
      .sort((a, b) => a.level - b.level)
      .map(l => ({
        ...l,
        approverName: l.approverId ? approverMap.get(l.approverId) || "Unknown" : "Unknown",
        minAmount: l.minAmount ? parseFloat(l.minAmount) : null,
        maxAmount: l.maxAmount ? parseFloat(l.maxAmount) : null,
      })),
  }));
}

router.get("/", async (req, res) => {
  const type = req.query.type as string;
  try {
    let query = db.select().from(approvalRulesTable);
    if (type) query = query.where(eq(approvalRulesTable.type, type)) as any;
    const rules = await query.orderBy(approvalRulesTable.name);
    res.json(await enrichRules(rules));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { name, companyId, department, type, levels } = req.body;
  if (!name || !type || !levels || !Array.isArray(levels)) {
    res.status(400).json({ error: "Bad Request" }); return;
  }
  try {
    const [rule] = await db.insert(approvalRulesTable).values({
      name,
      companyId: companyId || null,
      department: department || null,
      type,
    }).returning();
    if (levels.length > 0) {
      await db.insert(approvalRuleLevelsTable).values(
        levels.map((l: any) => ({
          ruleId: rule.id,
          level: l.level,
          approverId: l.approverId,
          minAmount: l.minAmount?.toString() || null,
          maxAmount: l.maxAmount?.toString() || null,
        }))
      );
    }
    await createAuditLog(req.user!.id, "create_approval_rule", "approval", rule.id);
    const enriched = await enrichRules([rule]);
    res.status(201).json(enriched[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, companyId, department, type, levels } = req.body;
  try {
    const [rule] = await db.update(approvalRulesTable)
      .set({ name, companyId: companyId || null, department: department || null, type })
      .where(eq(approvalRulesTable.id, id)).returning();
    if (!rule) { res.status(404).json({ error: "Not Found" }); return; }

    await db.delete(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, id));
    if (levels?.length > 0) {
      await db.insert(approvalRuleLevelsTable).values(
        levels.map((l: any) => ({
          ruleId: id,
          level: l.level,
          approverId: l.approverId,
          minAmount: l.minAmount?.toString() || null,
          maxAmount: l.maxAmount?.toString() || null,
        }))
      );
    }
    const enriched = await enrichRules([rule]);
    res.json(enriched[0]);
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
