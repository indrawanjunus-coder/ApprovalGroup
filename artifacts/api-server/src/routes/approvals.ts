import { Router } from "express";
import { db } from "../lib/db.js";
import {
  approvalsTable, purchaseRequestsTable, usersTable, userCompaniesTable, companiesTable,
  userLeaveBalancesTable, prItemsTable, prReceivingItemsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog, handleRouteError } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { sendApprovalRequestEmail, sendVendorAttachmentRequestEmail, sendPRApprovedEmail, sendTransferRecipientEmail } from "../lib/email.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;
  try {
    let pendingApprovals: any[] = [];
    if (user.role === "admin") {
      pendingApprovals = await db.select().from(approvalsTable).where(eq(approvalsTable.status, "pending")).limit(limit).offset(offset);
    } else {
      pendingApprovals = await db.select().from(approvalsTable)
        .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending")))
        .limit(limit).offset(offset);
    }

    const prIds = [...new Set(pendingApprovals.map(a => a.prId))];
    if (prIds.length === 0) {
      res.json({ approvals: [], total: 0, page, limit });
      return;
    }

    const [prs, uploaderRows] = await Promise.all([
      db.select().from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, prIds)),
      db.select({ prId: sql<number>`pr_id`, uploaderId: sql<number>`uploaded_by` }).from(sql`pr_vendor_attachments`),
    ]);
    const prMap = new Map(prs.map(p => [p.id, p]));
    const uploaderIds = uploaderRows.map(r => r.uploaderId).filter(Boolean);
    const approverIds = pendingApprovals.map(a => a.approverId);
    const allIds = [...new Set([...approverIds, ...uploaderIds])];
    const users = allIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));

    const requesterIds = [...new Set(prs.map(p => p.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));

    const filtered = pendingApprovals.filter(a => {
      const pr = prMap.get(a.prId);
      return pr && pr.currentApprovalLevel === a.level;
    });

    res.json({
      approvals: filtered.map(a => {
        const pr = prMap.get(a.prId)!;
        return {
          id: a.id, prId: a.prId, prNumber: pr.prNumber, prType: pr.type, prDescription: pr.description,
          requesterName: requesterMap.get(pr.requesterId) || "Unknown", department: pr.department,
          totalAmount: parseFloat(pr.totalAmount), approverId: a.approverId,
          approverName: userMap.get(a.approverId) || "Unknown",
          level: a.level, status: a.status, notes: a.notes, actionAt: a.actionAt, createdAt: a.createdAt,
        };
      }),
      total: filtered.length,
      page,
      limit,
    });
  } catch (err) { handleRouteError(res, err); }
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
        // Fully approved
        await db.update(purchaseRequestsTable).set({ status: "approved", currentApprovalLevel: null, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
        await createNotification(pr.requesterId, "PR Disetujui", `PR ${pr.prNumber} telah disetujui semua level`, "approved", pr.id);
        const purchasingUsers = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "purchasing"));
        for (const pu of purchasingUsers) {
          await createNotification(pu.id, "PR Siap Diproses", `PR ${pr.prNumber} siap untuk diproses`, "info", pr.id);
        }
        // Email: notify requester that PR is fully approved
        const [requester] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
        if (requester?.email) {
          sendPRApprovedEmail(requester.email, requester.name, pr.prNumber, pr.description).catch(() => {});
          // For non-leave, non-pembayaran, non-transfer types: also ask to upload vendor attachments
          if (pr.type !== "leave" && pr.type !== "pembayaran" && pr.type !== "transfer") {
            sendVendorAttachmentRequestEmail(requester.email, requester.name, pr.prNumber).catch(() => {});
          }
        }

        // Transfer: notify recipient
        if (pr.type === "transfer" && (pr as any).transferToUserId) {
          const [recipient] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, (pr as any).transferToUserId));
          if (recipient?.email) {
            const fromLoc = (pr as any).fromLocationId ? await db.execute(sql`SELECT name FROM locations WHERE id=${(pr as any).fromLocationId}`) : null;
            const toLoc = (pr as any).toLocationId ? await db.execute(sql`SELECT name FROM locations WHERE id=${(pr as any).toLocationId}`) : null;
            const fromName = (fromLoc as any)?.rows?.[0]?.name || "—";
            const toName = (toLoc as any)?.rows?.[0]?.name || "—";
            sendTransferRecipientEmail(recipient.email, recipient.name, pr.prNumber, requester?.name || "—", fromName, toName, pr.description).catch(() => {});
          }
        }

        // Leave: deduct balance (carried_over first, then balance_days)
        if (pr.type === "leave" && pr.leaveStartDate && pr.leaveEndDate) {
          try {
            const start = new Date(pr.leaveStartDate);
            const end = new Date(pr.leaveEndDate);
            const requestedDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const leaveUserId = (pr as any).leaveRequesterId || pr.requesterId;
            const year = start.getFullYear();
            let [balance] = await db.select().from(userLeaveBalancesTable)
              .where(and(eq(userLeaveBalancesTable.userId, leaveUserId), eq(userLeaveBalancesTable.year, year)));
            if (balance) {
              let remaining = requestedDays;
              let newCarriedOver = parseFloat(balance.carriedOverDays);
              let newBalance = parseFloat(balance.balanceDays);
              let newUsed = parseFloat(balance.usedDays);
              // Deduct carried_over first
              if (newCarriedOver > 0) {
                const fromCarried = Math.min(newCarriedOver, remaining);
                newCarriedOver -= fromCarried;
                remaining -= fromCarried;
              }
              // Then deduct balance_days
              if (remaining > 0) {
                newBalance = Math.max(0, newBalance - remaining);
              }
              newUsed += requestedDays;
              await db.update(userLeaveBalancesTable).set({
                carriedOverDays: newCarriedOver.toFixed(1),
                balanceDays: newBalance.toFixed(1),
                usedDays: newUsed.toFixed(1),
                updatedAt: new Date(),
              }).where(eq(userLeaveBalancesTable.id, balance.id));
            }
          } catch (leaveErr) { console.error("Leave deduction failed:", leaveErr); }
        }

        // Transfer: auto-create receiving (mark items as ready to receive)
        if (pr.type === "transfer") {
          try {
            const prItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, pr.id));
            if (prItems.length > 0) {
              await db.update(purchaseRequestsTable).set({
                receivingStatus: "pending",
                updatedAt: new Date(),
              }).where(eq(purchaseRequestsTable.id, pr.id));
            }
          } catch (transferErr) { console.error("Transfer receiving setup failed:", transferErr); }
        }
      } else {
        await db.update(purchaseRequestsTable).set({ currentApprovalLevel: nextLevel, updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, pr.id));
        const nextApprovers = allApprovals.filter(a => a.level === nextLevel);
        for (const na of nextApprovers) {
          await createNotification(na.approverId, "PR Perlu Disetujui", `PR ${pr.prNumber} perlu persetujuan Anda (Level ${nextLevel})`, "approval_request", pr.id);
          // Send email to next approver
          const [approverUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, na.approverId));
          if (approverUser?.email) {
            const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
            sendApprovalRequestEmail(approverUser.email, approverUser.name, pr.prNumber, requester?.name || "Unknown", parseFloat(pr.totalAmount), pr.description).catch(() => {});
          }
        }
      }
      await createAuditLog(user.id, "approve_pr", "approval", id, `Approved PR ${pr.prNumber} level ${approval.level}`);
    }
    res.json({ ...updated, approverName: user.name });
  } catch (err) { handleRouteError(res, err); }
}

router.post("/:id/approve", (req, res) => processApprovalAction(req, res, "approved"));
router.post("/:id/reject", (req, res) => processApprovalAction(req, res, "rejected"));

export default router;
