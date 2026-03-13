import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, purchaseOrdersTable, approvalsTable, prItemsTable, usersTable
} from "@workspace/db/schema";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  try {
    const [
      pendingApprovalsResult,
      myPRsResult,
      pendingPOsResult,
      totalPRsResult,
      totalPOsResult,
      recentPRs,
      prByStatusResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(approvalsTable)
        .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending"))),
      db.select({ count: count() }).from(purchaseRequestsTable)
        .where(and(eq(purchaseRequestsTable.requesterId, user.id), eq(purchaseRequestsTable.status, "waiting_approval"))),
      db.select({ count: count() }).from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.status, "draft")),
      db.select({ count: count() }).from(purchaseRequestsTable),
      db.select({ count: count() }).from(purchaseOrdersTable),
      db.select().from(purchaseRequestsTable).orderBy(desc(purchaseRequestsTable.createdAt)).limit(5),
      db.select({ status: purchaseRequestsTable.status, count: count() }).from(purchaseRequestsTable).groupBy(purchaseRequestsTable.status),
    ]);

    const prIds = recentPRs.map(p => p.id);
    const [recentItems, recentApprovalsList, requesterIds] = await Promise.all([
      prIds.length > 0 ? db.select().from(prItemsTable).where(inArray(prItemsTable.prId, prIds)) : [],
      db.select().from(approvalsTable)
        .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending")))
        .limit(5),
      Promise.resolve([...new Set(recentPRs.map(p => p.requesterId))]),
    ]);

    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));

    const recentPRsFormatted = recentPRs.map(pr => {
      const items = recentItems.filter(i => i.prId === pr.id);
      return {
        ...pr,
        requesterName: requesterMap.get(pr.requesterId) || "Unknown",
        totalAmount: parseFloat(pr.totalAmount),
        items: items.map(i => ({
          ...i,
          qty: parseFloat(i.qty),
          estimatedPrice: parseFloat(i.estimatedPrice),
          totalPrice: parseFloat(i.totalPrice),
        })),
        approvals: [],
      };
    });

    const approvalPrIds = recentApprovalsList.map(a => a.prId);
    const approvalPrs = approvalPrIds.length > 0
      ? await db.select().from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, approvalPrIds))
      : [];
    const approvalPrMap = new Map(approvalPrs.map(p => [p.id, p]));
    const approvalRequesterIds = [...new Set(approvalPrs.map(p => p.requesterId))];
    const approvalRequesters = approvalRequesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approvalRequesterIds))
      : [];
    const approvalRequesterMap = new Map(approvalRequesters.map(r => [r.id, r.name]));

    const filteredApprovals = recentApprovalsList.filter(a => {
      const pr = approvalPrMap.get(a.prId);
      return pr && pr.currentApprovalLevel === a.level;
    });

    const recentApprovalsFormatted = filteredApprovals.map(a => {
      const pr = approvalPrMap.get(a.prId)!;
      return {
        id: a.id,
        prId: a.prId,
        prNumber: pr.prNumber,
        prType: pr.type,
        prDescription: pr.description,
        requesterName: approvalRequesterMap.get(pr.requesterId) || "Unknown",
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

    res.json({
      pendingApprovals: Number(pendingApprovalsResult[0]?.count) || 0,
      myPendingPRs: Number(myPRsResult[0]?.count) || 0,
      pendingPOs: Number(pendingPOsResult[0]?.count) || 0,
      totalPRs: Number(totalPRsResult[0]?.count) || 0,
      totalPOs: Number(totalPOsResult[0]?.count) || 0,
      recentPRs: recentPRsFormatted,
      recentApprovals: recentApprovalsFormatted,
      prByStatus: prByStatusResult.map(r => ({ status: r.status, count: Number(r.count) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
