import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, prItemsTable, approvalsTable, approvalRulesTable,
  approvalRuleLevelsTable, usersTable, companiesTable
} from "@workspace/db/schema";
import { eq, desc, ilike, and, inArray, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { generatePRNumber } from "../lib/prNumber.js";

const router = Router();
router.use(requireAuth);

async function enrichPR(pr: any, items: any[], approvals: any[]) {
  let companyName: string | null = null;
  if (pr.companyId) {
    const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, pr.companyId));
    companyName = c?.name || null;
  }
  let leaveRequesterName: string | null = null;
  if (pr.leaveRequesterId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.leaveRequesterId));
    leaveRequesterName = u?.name || null;
  }
  return {
    ...pr,
    companyName,
    leaveRequesterName,
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
    if (user.role === "user") conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (type) conditions.push(eq(purchaseRequestsTable.type, type));
    if (search) conditions.push(ilike(purchaseRequestsTable.description, `%${search}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [prs, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable).where(whereClause).orderBy(desc(purchaseRequestsTable.createdAt)).limit(limit).offset(offset),
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

    const companyIds = [...new Set(prs.filter(p => p.companyId).map(p => p.companyId!))];
    const companies = companyIds.length > 0
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, companyIds))
      : [];
    const companyMap = new Map(companies.map(c => [c.id, c.name]));

    const leaveRequesterIds = [...new Set(prs.filter(p => p.leaveRequesterId).map(p => p.leaveRequesterId!))];
    const leaveRequesters = leaveRequesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, leaveRequesterIds))
      : [];
    const leaveRequesterMap = new Map(leaveRequesters.map(u => [u.id, u.name]));

    const result = prs.map(pr => {
      const prItems = items.filter(i => i.prId === pr.id);
      const prApprovals = approvalsData.filter(a => a.prId === pr.id).map(a => ({
        ...a, approverName: approverMap.get(a.approverId) || "Unknown"
      }));
      return {
        ...pr,
        requesterName: requesterMap.get(pr.requesterId) || "Unknown",
        companyName: pr.companyId ? companyMap.get(pr.companyId) || null : null,
        leaveRequesterName: pr.leaveRequesterId ? leaveRequesterMap.get(pr.leaveRequesterId) || null : null,
        totalAmount: parseFloat(pr.totalAmount),
        items: prItems.map(i => ({ ...i, qty: parseFloat(i.qty), estimatedPrice: parseFloat(i.estimatedPrice), totalPrice: parseFloat(i.totalPrice) })),
        approvals: prApprovals,
      };
    });

    res.json({ purchaseRequests: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = req.user!;
  const { type, description, items, notes, companyId, department, leaveStartDate, leaveEndDate, leaveRequesterId } = req.body;
  if (!type || !description) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" }); return;
  }
  if (type !== "leave" && (!items || !Array.isArray(items) || items.length === 0)) {
    res.status(400).json({ error: "Bad Request", message: "Items required for this request type" }); return;
  }
  try {
    const prNumber = await generatePRNumber();
    const totalAmount = type === "leave" ? 0 : (items || []).reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0);
    const [pr] = await db.insert(purchaseRequestsTable).values({
      prNumber,
      requesterId: user.id,
      department: department || user.department,
      companyId: companyId || null,
      type,
      description,
      status: "draft",
      totalAmount: totalAmount.toString(),
      notes,
      leaveStartDate: leaveStartDate || null,
      leaveEndDate: leaveEndDate || null,
      leaveRequesterId: leaveRequesterId || user.id,
    }).returning();

    let prItems: any[] = [];
    if (type !== "leave" && items?.length > 0) {
      prItems = await db.insert(prItemsTable).values(
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
    }

    await createAuditLog(user.id, "create_pr", "pr", pr.id, `Created PR ${prNumber}`);
    res.status(201).json(await enrichPR({ ...pr, requesterName: user.name }, prItems, []));
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
    res.json(await enrichPR({ ...pr, requesterName: requester[0]?.name || "Unknown" }, items, approvalsWithNames));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { type, description, items, notes, companyId, leaveStartDate, leaveEndDate, leaveRequesterId } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") { res.status(400).json({ error: "Can only edit draft PRs" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const totalAmount = items
      ? items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0)
      : parseFloat(pr.totalAmount);
    const [updated] = await db.update(purchaseRequestsTable).set({
      type: type || pr.type,
      description: description || pr.description,
      companyId: companyId !== undefined ? companyId : pr.companyId,
      totalAmount: totalAmount.toString(),
      notes,
      leaveStartDate: leaveStartDate !== undefined ? leaveStartDate : pr.leaveStartDate,
      leaveEndDate: leaveEndDate !== undefined ? leaveEndDate : pr.leaveEndDate,
      leaveRequesterId: leaveRequesterId !== undefined ? leaveRequesterId : pr.leaveRequesterId,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();
    if (items) {
      await db.delete(prItemsTable).where(eq(prItemsTable.prId, id));
      if (items.length > 0) {
        await db.insert(prItemsTable).values(items.map((item: any) => ({
          prId: id, name: item.name, description: item.description,
          qty: item.qty.toString(), unit: item.unit,
          estimatedPrice: item.estimatedPrice.toString(),
          totalPrice: (parseFloat(item.qty) * parseFloat(item.estimatedPrice)).toString(),
        })));
      }
    }
    const newItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    await createAuditLog(user.id, "update_pr", "pr", id);
    res.json(await enrichPR({ ...updated, requesterName: requester?.name || "Unknown" }, newItems, []));
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
    if (pr.status !== "draft") { res.status(400).json({ error: "PR is not in draft status" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const amount = parseFloat(pr.totalAmount);
    
    // Find matching approval rule: match type, company (optional), department (optional)
    const allRules = await db.select().from(approvalRulesTable).where(eq(approvalRulesTable.type, pr.type));
    
    // Priority: company+department match > company match > no filter match
    let matchingRule = allRules.find(r =>
      r.companyId === pr.companyId &&
      r.department === pr.department
    ) || allRules.find(r =>
      r.companyId === pr.companyId && !r.department
    ) || allRules.find(r =>
      !r.companyId && r.department === pr.department
    ) || allRules.find(r => !r.companyId && !r.department);

    if (!matchingRule) {
      res.status(400).json({ error: "Bad Request", message: "Tidak ditemukan aturan approval untuk PR ini. Silakan hubungi Admin." }); return;
    }

    const allLevels = await db.select().from(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, matchingRule.id));
    
    // Filter levels by amount (for purchase/repair), all levels for leave
    const applicableLevels = pr.type === "leave"
      ? allLevels
      : allLevels.filter(l => {
          const min = l.minAmount ? parseFloat(l.minAmount) : 0;
          const max = l.maxAmount ? parseFloat(l.maxAmount) : Infinity;
          return amount >= min && amount <= max;
        });

    if (applicableLevels.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "Tidak ada approver yang sesuai untuk jumlah ini. Hubungi Admin." }); return;
    }

    await db.insert(approvalsTable).values(
      applicableLevels.map(l => ({
        prId: id,
        approverId: l.approverId!,
        level: l.level,
        status: "pending",
      }))
    );

    const minLevel = Math.min(...applicableLevels.map(l => l.level));
    const [updated] = await db.update(purchaseRequestsTable).set({
      status: "waiting_approval",
      currentApprovalLevel: minLevel,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    // Notify first-level approvers
    for (const l of applicableLevels.filter(l => l.level === minLevel)) {
      await createNotification(l.approverId!, "PR Perlu Disetujui",
        `PR ${pr.prNumber} dari ${user.name} membutuhkan persetujuan Anda`, "approval_request", id);
    }

    await createAuditLog(user.id, "submit_pr", "pr", id, `PR ${pr.prNumber} submitted`);

    const items = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const approvals = await db.select().from(approvalsTable).where(eq(approvalsTable.prId, id));
    const approverIds = approvals.map(a => a.approverId);
    const approvers = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
      : [];
    const approverMap = new Map(approvers.map(a => [a.id, a.name]));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));

    res.json(await enrichPR(
      { ...updated, requesterName: requester?.name || user.name },
      items,
      approvals.map(a => ({ ...a, approverName: approverMap.get(a.approverId) || "Unknown" }))
    ));
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
    if (pr.status !== "approved") { res.status(400).json({ error: "PR must be approved to receive" }); return; }
    const [updated] = await db.update(purchaseRequestsTable).set({ status: "completed", notes: notes || pr.notes, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, id)).returning();
    await createAuditLog(user.id, "receive_pr", "pr", id);
    await createNotification(pr.requesterId, "PR Selesai", `PR ${pr.prNumber} telah diterima`, "info", id);
    const items = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(await enrichPR({ ...updated, requesterName: requester?.name || "Unknown" }, items, []));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
