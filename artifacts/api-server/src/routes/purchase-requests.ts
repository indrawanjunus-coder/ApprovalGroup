import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, prItemsTable, approvalsTable, approvalRulesTable,
  approvalRuleLevelsTable, usersTable, settingsTable
} from "@workspace/db/schema";
import { eq, desc, ilike, and, or, inArray, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { generatePRNumber } from "../lib/prNumber.js";

const router = Router();
router.use(requireAuth);

function formatPR(pr: any, items: any[], approvals: any[]) {
  return {
    ...pr,
    totalAmount: parseFloat(pr.totalAmount),
    items: items.map(i => ({
      ...i,
      qty: parseFloat(i.qty),
      estimatedPrice: parseFloat(i.estimatedPrice),
      totalPrice: parseFloat(i.totalPrice),
    })),
    approvals,
  };
}

router.get("/", async (req, res) => {
  const user = req.user!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string;
  const type = req.query.type as string;
  const search = req.query.search as string;
  const offset = (page - 1) * limit;

  try {
    let conditions: any[] = [];
    
    if (user.role === "user") {
      conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    }
    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (type) conditions.push(eq(purchaseRequestsTable.type, type));
    if (search) conditions.push(ilike(purchaseRequestsTable.description, `%${search}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [prs, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(whereClause)
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const prIds = prs.map(p => p.id);
    const [items, approvalsData, requesterData] = await Promise.all([
      prIds.length > 0 ? db.select().from(prItemsTable).where(inArray(prItemsTable.prId, prIds)) : [],
      prIds.length > 0 ? db.select().from(approvalsTable).where(inArray(approvalsTable.prId, prIds)) : [],
      prs.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, prs.map(p => p.requesterId))) : [],
    ]);

    const approverIds = [...new Set(approvalsData.map(a => a.approverId))];
    const approvers = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
      : [];
    const approverMap = new Map(approvers.map(a => [a.id, a.name]));
    const requesterMap = new Map(requesterData.map(r => [r.id, r.name]));

    const result = prs.map(pr => {
      const prItems = items.filter(i => i.prId === pr.id);
      const prApprovals = approvalsData.filter(a => a.prId === pr.id).map(a => ({
        ...a, approverName: approverMap.get(a.approverId) || "Unknown"
      }));
      return formatPR({ ...pr, requesterName: requesterMap.get(pr.requesterId) || "Unknown" }, prItems, prApprovals);
    });

    res.json({ purchaseRequests: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = req.user!;
  const { type, description, items, notes } = req.body;
  if (!type || !description || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }
  try {
    const prNumber = await generatePRNumber();
    const totalAmount = items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0);

    const [pr] = await db.insert(purchaseRequestsTable).values({
      prNumber,
      requesterId: user.id,
      department: user.department,
      type,
      description,
      status: "draft",
      totalAmount: totalAmount.toString(),
      notes,
    }).returning();

    const prItems = await db.insert(prItemsTable).values(
      items.map((item: any) => ({
        prId: pr.id,
        name: item.name,
        description: item.description,
        qty: item.qty.toString(),
        unit: item.unit,
        estimatedPrice: item.estimatedPrice.toString(),
        totalPrice: (parseFloat(item.qty) * parseFloat(item.estimatedPrice)).toString(),
      }))
    ).returning();

    await createAuditLog(user.id, "create_pr", "pr", pr.id, `Created PR ${prNumber}`);

    res.status(201).json(formatPR({ ...pr, requesterName: user.name }, prItems, []));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    const [items, approvalsData, requester] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, id)),
      db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId)),
    ]);
    const approverIds = approvalsData.map(a => a.approverId);
    const approvers = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
      : [];
    const approverMap = new Map(approvers.map(a => [a.id, a.name]));
    const approvalsWithNames = approvalsData.map(a => ({ ...a, approverName: approverMap.get(a.approverId) || "Unknown" }));
    res.json(formatPR({ ...pr, requesterName: requester[0]?.name || "Unknown" }, items, approvalsWithNames));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { type, description, items, notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") {
      res.status(400).json({ error: "Bad Request", message: "Can only edit draft PRs" });
      return;
    }
    if (pr.requesterId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const totalAmount = items
      ? items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0)
      : parseFloat(pr.totalAmount);

    const [updated] = await db.update(purchaseRequestsTable).set({
      type: type || pr.type,
      description: description || pr.description,
      totalAmount: totalAmount.toString(),
      notes,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    if (items) {
      await db.delete(prItemsTable).where(eq(prItemsTable.prId, id));
      await db.insert(prItemsTable).values(
        items.map((item: any) => ({
          prId: id,
          name: item.name,
          description: item.description,
          qty: item.qty.toString(),
          unit: item.unit,
          estimatedPrice: item.estimatedPrice.toString(),
          totalPrice: (parseFloat(item.qty) * parseFloat(item.estimatedPrice)).toString(),
        }))
      );
    }
    const newItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    await createAuditLog(user.id, "update_pr", "pr", id);
    res.json(formatPR({ ...updated, requesterName: requester?.name || "Unknown" }, newItems, []));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/submit", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") {
      res.status(400).json({ error: "Bad Request", message: "PR is not in draft status" }); return;
    }
    if (pr.requesterId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const amount = parseFloat(pr.totalAmount);
    const rules = await db.select().from(approvalRulesTable);
    const matchingRule = rules.find(r => {
      const min = parseFloat(r.minAmount);
      const max = r.maxAmount ? parseFloat(r.maxAmount) : Infinity;
      return amount >= min && amount <= max;
    });

    if (!matchingRule) {
      res.status(400).json({ error: "Bad Request", message: "No approval rule found for this amount. Please contact admin." });
      return;
    }

    const ruleLevels = await db.select().from(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, matchingRule.id));
    const approvers = await db.select().from(usersTable).where(eq(usersTable.role, "approver"));

    const approvalEntries = ruleLevels.map(rl => {
      const approver = approvers.find(a => {
        if (rl.position) return a.position === rl.position;
        return a.role === rl.role;
      });
      return { level: rl.level, approverId: approver?.id };
    }).filter(e => e.approverId);

    if (approvalEntries.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "No approvers found for this PR. Please contact admin." });
      return;
    }

    await db.insert(approvalsTable).values(
      approvalEntries.map(e => ({
        prId: id,
        approverId: e.approverId!,
        level: e.level,
        status: "pending",
      }))
    );

    const [updated] = await db.update(purchaseRequestsTable).set({
      status: "waiting_approval",
      currentApprovalLevel: Math.min(...approvalEntries.map(e => e.level)),
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    for (const entry of approvalEntries) {
      if (entry.level === updated.currentApprovalLevel) {
        await createNotification(
          entry.approverId!,
          "PR Perlu Disetujui",
          `PR ${pr.prNumber} dari ${user.name} membutuhkan persetujuan Anda`,
          "approval_request",
          id
        );
      }
    }

    await createAuditLog(user.id, "submit_pr", "pr", id, `PR ${pr.prNumber} submitted for approval`);
    const items = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const approvalsData = await db.select().from(approvalsTable).where(eq(approvalsTable.prId, id));
    const approverIds = approvalsData.map(a => a.approverId);
    const approversData = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
      : [];
    const approverMap = new Map(approversData.map(a => [a.id, a.name]));
    const approvalsWithNames = approvalsData.map(a => ({ ...a, approverName: approverMap.get(a.approverId) || "Unknown" }));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(formatPR({ ...updated, requesterName: requester?.name || user.name }, items, approvalsWithNames));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/receive", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "approved") {
      res.status(400).json({ error: "Bad Request", message: "PR must be approved to receive" }); return;
    }
    const [updated] = await db.update(purchaseRequestsTable).set({
      status: "completed",
      notes: notes || pr.notes,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    await createAuditLog(user.id, "receive_pr", "pr", id, `PR ${pr.prNumber} received`);
    await createNotification(pr.requesterId, "PR Selesai", `PR ${pr.prNumber} telah diterima`, "info", id);

    const items = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(formatPR({ ...updated, requesterName: requester?.name || "Unknown" }, items, []));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
