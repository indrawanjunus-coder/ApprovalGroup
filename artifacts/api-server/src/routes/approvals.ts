import { Router } from "express";
import { db } from "@workspace/db";
import {
  approvalsTable, purchaseRequestsTable, approvalRulesTable, approvalRuleLevelsTable, usersTable, prItemsTable
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  try {
    const myApprovals = await db.select().from(approvalsTable)
      .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending")));

    if (myApprovals.length === 0) {
      res.json({ approvals: [], total: 0 });
      return;
    }

    const prIds = myApprovals.map(a => a.prId);
    const prs = await db.select().from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, prIds));
    const requesterIds = [...new Set(prs.map(p => p.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));
    const prMap = new Map(prs.map(p => [p.id, p]));

    const filteredApprovals = myApprovals.filter(a => {
      const pr = prMap.get(a.prId);
      return pr && pr.currentApprovalLevel === a.level;
    });

    const result = filteredApprovals.map(a => {
      const pr = prMap.get(a.prId)!;
      return {
        id: a.id,
        prId: a.prId,
        prNumber: pr.prNumber,
        prType: pr.type,
        prDescription: pr.description,
        requesterName: requesterMap.get(pr.requesterId) || "Unknown",
        department: pr.department,
        totalAmount: parseFloat(pr.totalAmount),
        approverId: a.approverId,
        approverName: user.name,
        level: a.level,
        status: a.status,
        notes: a.notes,
        actionAt: a.actionAt,
        createdAt: a.createdAt,
      };
    });

    res.json({ approvals: result, total: result.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function processApprovalAction(req: any, res: any, action: "approved" | "rejected") {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;

  try {
    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
    if (!approval) { res.status(404).json({ error: "Not Found" }); return; }
    if (approval.approverId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (approval.status !== "pending") {
      res.status(400).json({ error: "Bad Request", message: "Approval already processed" }); return;
    }

    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, approval.prId));
    if (!pr || pr.currentApprovalLevel !== approval.level) {
      res.status(400).json({ error: "Bad Request", message: "Not the current approval level" }); return;
    }

    const [updated] = await db.update(approvalsTable).set({
      status: action,
      notes,
      actionAt: new Date(),
    }).where(eq(approvalsTable.id, id)).returning();

    if (action === "rejected") {
      await db.update(purchaseRequestsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
      await createNotification(pr.requesterId, "PR Ditolak", `PR ${pr.prNumber} ditolak oleh ${user.name}${notes ? `: ${notes}` : ""}`, "rejected", pr.id);
      await createAuditLog(user.id, "reject_pr", "approval", id, `Rejected PR ${pr.prNumber}`);
    } else {
      const allApprovals = await db.select().from(approvalsTable).where(eq(approvalsTable.prId, pr.id));
      const nextLevel = Math.min(...allApprovals.filter(a => a.status === "pending" && a.level > approval.level).map(a => a.level));
      
      if (nextLevel === Infinity) {
        await db.update(purchaseRequestsTable).set({ status: "approved", currentApprovalLevel: null, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
        await createNotification(pr.requesterId, "PR Disetujui", `PR ${pr.prNumber} telah disetujui semua level`, "approved", pr.id);

        const purchasingUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "purchasing"));
        for (const pu of purchasingUsers) {
          await createNotification(pu.id, "PR Siap Dibuat PO", `PR ${pr.prNumber} siap untuk dibuat PO`, "info", pr.id);
        }
      } else {
        await db.update(purchaseRequestsTable).set({ currentApprovalLevel: nextLevel, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
        const nextApprovers = allApprovals.filter(a => a.level === nextLevel);
        for (const na of nextApprovers) {
          await createNotification(na.approverId, "PR Perlu Disetujui", `PR ${pr.prNumber} perlu persetujuan Anda (Level ${nextLevel})`, "approval_request", pr.id);
        }
      }
      await createAuditLog(user.id, "approve_pr", "approval", id, `Approved PR ${pr.prNumber} level ${approval.level}`);
    }

    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json({ ...updated, approverName: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

router.post("/:id/approve", (req, res) => processApprovalAction(req, res, "approved"));
router.post("/:id/reject", (req, res) => processApprovalAction(req, res, "rejected"));

router.get("/rules", async (req, res) => {
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

router.post("/rules", requireRole("admin"), async (req, res) => {
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
    const ruleLevels = await db.insert(approvalRuleLevelsTable).values(
      levels.map((l: any) => ({ ruleId: rule.id, level: l.level, role: l.role, position: l.position || null }))
    ).returning();
    await createAuditLog(req.user!.id, "create_approval_rule", "approval", rule.id);
    res.status(201).json({ ...rule, minAmount: parseFloat(rule.minAmount), maxAmount: rule.maxAmount ? parseFloat(rule.maxAmount) : null, levels: ruleLevels });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/rules/:id", requireRole("admin"), async (req, res) => {
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
    const ruleLevels = await db.insert(approvalRuleLevelsTable).values(
      levels.map((l: any) => ({ ruleId: id, level: l.level, role: l.role, position: l.position || null }))
    ).returning();
    res.json({ ...rule, minAmount: parseFloat(rule.minAmount), maxAmount: rule.maxAmount ? parseFloat(rule.maxAmount) : null, levels: ruleLevels });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/rules/:id", requireRole("admin"), async (req, res) => {
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
