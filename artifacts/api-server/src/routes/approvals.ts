import { Router } from "express";
import { db } from "@workspace/db";
import {
  approvalsTable, purchaseRequestsTable, usersTable, userCompaniesTable, companiesTable
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  try {
    // Get user's assigned companies and departments
    const userAssignments = await db.select().from(userCompaniesTable)
      .where(eq(sql`${userCompaniesTable.userId}::integer`, user.id));

    // Get all pending approvals for this user
    const myApprovals = await db.select().from(approvalsTable)
      .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending")));

    if (myApprovals.length === 0) { res.json({ approvals: [], total: 0 }); return; }

    const prIds = myApprovals.map(a => a.prId);
    const prs = await db.select().from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, prIds));

    // Filter PRs by current level AND company/department assignment
    const filteredApprovals = myApprovals.filter(a => {
      const pr = prs.find(p => p.id === a.prId);
      if (!pr || pr.currentApprovalLevel !== a.level) return false;

      // If user has company assignments, filter by them
      if (userAssignments.length > 0) {
        return userAssignments.some(ua => {
          const companyMatch = !pr.companyId || ua.companyId === String(pr.companyId);
          const deptMatch = !ua.department || ua.department === pr.department;
          return companyMatch && deptMatch;
        });
      }
      // No assignments = can approve all (for backward compat)
      return true;
    });

    if (filteredApprovals.length === 0) { res.json({ approvals: [], total: 0 }); return; }

    const filteredPrIds = filteredApprovals.map(a => a.prId);
    const filteredPRs = prs.filter(p => filteredPrIds.includes(p.id));
    const requesterIds = [...new Set(filteredPRs.map(p => p.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));
    const prMap = new Map(filteredPRs.map(p => [p.id, p]));

    const result = filteredApprovals.map(a => {
      const pr = prMap.get(a.prId)!;
      return {
        id: a.id, prId: a.prId, prNumber: pr.prNumber, prType: pr.type,
        prDescription: pr.description, requesterName: requesterMap.get(pr.requesterId) || "Unknown",
        department: pr.department, totalAmount: parseFloat(pr.totalAmount),
        approverId: a.approverId, approverName: user.name, level: a.level,
        status: a.status, notes: a.notes, actionAt: a.actionAt, createdAt: a.createdAt,
      };
    });

    res.json({ approvals: result, total: result.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

async function processApprovalAction(req: any, res: any, action: "approved" | "rejected") {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [approval] = await db.select().from(approvalsTable).where(eq(approvalsTable.id, id));
    if (!approval) { res.status(404).json({ error: "Not Found" }); return; }
    if (approval.approverId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (approval.status !== "pending") { res.status(400).json({ error: "Approval already processed" }); return; }

    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, approval.prId));
    if (!pr || pr.currentApprovalLevel !== approval.level) {
      res.status(400).json({ error: "Not the current approval level" }); return;
    }

    const [updated] = await db.update(approvalsTable).set({
      status: action, notes, actionAt: new Date(),
    }).where(eq(approvalsTable.id, id)).returning();

    if (action === "rejected") {
      await db.update(purchaseRequestsTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
      await createNotification(pr.requesterId, "PR Ditolak", `PR ${pr.prNumber} ditolak oleh ${user.name}${notes ? `: ${notes}` : ""}`, "rejected", pr.id);
      await createAuditLog(user.id, "reject_pr", "approval", id, `Rejected PR ${pr.prNumber}`);
    } else {
      const allApprovals = await db.select().from(approvalsTable).where(eq(approvalsTable.prId, pr.id));
      const pendingHigher = allApprovals.filter(a => a.status === "pending" && a.level > approval.level);
      const nextLevel = pendingHigher.length > 0 ? Math.min(...pendingHigher.map(a => a.level)) : Infinity;

      if (nextLevel === Infinity) {
        await db.update(purchaseRequestsTable).set({ status: "approved", currentApprovalLevel: null, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
        await createNotification(pr.requesterId, "PR Disetujui", `PR ${pr.prNumber} telah disetujui semua level`, "approved", pr.id);
        const purchasingUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "purchasing"));
        for (const pu of purchasingUsers) {
          await createNotification(pu.id, "PR Siap Diproses", `PR ${pr.prNumber} siap untuk diproses`, "info", pr.id);
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
    res.json({ ...updated, approverName: user.name });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
}

router.post("/:id/approve", (req, res) => processApprovalAction(req, res, "approved"));
router.post("/:id/reject", (req, res) => processApprovalAction(req, res, "rejected"));

export default router;
