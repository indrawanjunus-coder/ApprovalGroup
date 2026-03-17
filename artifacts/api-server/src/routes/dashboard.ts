import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, purchaseOrdersTable, approvalsTable,
  usersTable, prVendorAttachmentsTable
} from "@workspace/db/schema";
import { eq, and, desc, count, sql, inArray, ne, isNotNull, or, SQL } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

// Build a WHERE condition for PRs based on user's role, company, and department
function buildPRAccessCondition(user: Express.Request["user"] & {}): SQL | undefined {
  if (!user) return undefined;
  if ((user as any).role === "admin") return undefined; // admin: no restriction
  const u = user as any;
  if (u.role === "approver") {
    // Approver: same department AND same company
    const parts: SQL[] = [eq(purchaseRequestsTable.department, u.department)];
    if (u.hiredCompanyId) parts.push(eq(purchaseRequestsTable.companyId, u.hiredCompanyId));
    return and(...parts);
  }
  // user / purchasing: own PRs within same company
  const parts: SQL[] = [eq(purchaseRequestsTable.requesterId, u.id)];
  if (u.hiredCompanyId) parts.push(eq(purchaseRequestsTable.companyId, u.hiredCompanyId));
  return and(...parts);
}

router.get("/", async (req, res) => {
  const user = req.user!;
  const isManager = ["admin", "approver", "purchasing"].includes(user.role);
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(`${currentYear}-01-01`);
  const yearEnd = new Date(`${currentYear}-12-31`);

  // Access condition for PRs (company + dept filtering)
  const prAccessCond = buildPRAccessCondition(user as any);

  try {
    // Base stats
    const [
      pendingApprovalsResult,
      myPRsResult,
      totalPRsResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(approvalsTable)
        .where(and(eq(approvalsTable.approverId, user.id), eq(approvalsTable.status, "pending"))),
      db.select({ count: count() }).from(purchaseRequestsTable)
        .where(and(eq(purchaseRequestsTable.requesterId, user.id), eq(purchaseRequestsTable.status, "waiting_approval"))),
      db.select({ count: count() }).from(purchaseRequestsTable)
        .where(prAccessCond ? and(ne(purchaseRequestsTable.type, "leave"), prAccessCond) : ne(purchaseRequestsTable.type, "leave")),
    ]);

    // Pending POs: filter by company for non-admin (join via prId → companyId)
    let pendingPOsCount = 0;
    if (user.role === "admin") {
      const r = await db.select({ count: count() }).from(purchaseOrdersTable)
        .where(eq(purchaseOrdersTable.status, "draft"));
      pendingPOsCount = Number(r[0]?.count) || 0;
    } else if (user.hiredCompanyId) {
      // Find PRs in user's company, then count POs linked to those PRs
      const companyPRs = await db.select({ id: purchaseRequestsTable.id })
        .from(purchaseRequestsTable)
        .where(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
      const companyPRIds = companyPRs.map(p => p.id);
      if (companyPRIds.length > 0) {
        const r = await db.select({ count: count() }).from(purchaseOrdersTable)
          .where(and(eq(purchaseOrdersTable.status, "draft"), inArray(purchaseOrdersTable.prId, companyPRIds)));
        pendingPOsCount = Number(r[0]?.count) || 0;
      }
    }

    // Build combined condition for non-leave PRs with access control
    const nonLeaveAccessCond = prAccessCond
      ? and(ne(purchaseRequestsTable.type, "leave"), prAccessCond)
      : ne(purchaseRequestsTable.type, "leave");

    const leaveAccessCond = prAccessCond
      ? and(eq(purchaseRequestsTable.type, "leave"), prAccessCond)
      : eq(purchaseRequestsTable.type, "leave");

    // Recent PRs (non-leave types)
    const recentPRsRaw = await db.select().from(purchaseRequestsTable)
      .where(nonLeaveAccessCond)
      .orderBy(desc(purchaseRequestsTable.createdAt)).limit(8);

    // Recent Leave PRs
    const recentLeavePRsRaw = await db.select().from(purchaseRequestsTable)
      .where(leaveAccessCond)
      .orderBy(desc(purchaseRequestsTable.createdAt)).limit(8);

    // PR by status (non-leave)
    const prByStatusResult = await db.select({ status: purchaseRequestsTable.status, count: count() })
      .from(purchaseRequestsTable)
      .where(nonLeaveAccessCond)
      .groupBy(purchaseRequestsTable.status);

    // Fetch requester names for recent PRs
    const allRecentIds = [...new Set([
      ...recentPRsRaw.map(p => p.requesterId),
      ...recentLeavePRsRaw.map(p => p.requesterId),
    ])];
    const recentRequesters = allRecentIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allRecentIds))
      : [];
    const requesterMap = new Map(recentRequesters.map(r => [r.id, r.name]));

    const formatPRList = (prs: typeof recentPRsRaw) => prs.map(pr => ({
      id: pr.id,
      prNumber: pr.prNumber,
      type: pr.type,
      status: pr.status,
      totalAmount: parseFloat(pr.totalAmount),
      requesterName: requesterMap.get(pr.requesterId) || "Unknown",
      createdAt: pr.createdAt,
      leaveStartDate: pr.leaveStartDate,
      leaveEndDate: pr.leaveEndDate,
    }));

    // --- Vendor Lead Time ---
    const closedPRsWhere = prAccessCond
      ? and(isNotNull(purchaseRequestsTable.receivingClosedAt), isNotNull(purchaseRequestsTable.vendorSelectedAt), prAccessCond)
      : and(isNotNull(purchaseRequestsTable.receivingClosedAt), isNotNull(purchaseRequestsTable.vendorSelectedAt));

    const closedPRs = await db.select({
      id: purchaseRequestsTable.id,
      vendorSelectedAt: purchaseRequestsTable.vendorSelectedAt,
      selectedVendorId: purchaseRequestsTable.selectedVendorId,
      receivingClosedAt: purchaseRequestsTable.receivingClosedAt,
    }).from(purchaseRequestsTable).where(closedPRsWhere);

    const closedPRIds = closedPRs.map(p => p.id);
    const relatedPOs = closedPRIds.length > 0
      ? await db.select({
          prId: purchaseOrdersTable.prId,
          supplier: purchaseOrdersTable.supplier,
          issuedAt: purchaseOrdersTable.issuedAt,
          createdAt: purchaseOrdersTable.createdAt,
        }).from(purchaseOrdersTable)
        .where(and(inArray(purchaseOrdersTable.prId, closedPRIds), isNotNull(purchaseOrdersTable.issuedAt)))
      : [];
    const poByPrId = new Map(relatedPOs.map(po => [po.prId, po]));

    const vendorAttIds = closedPRs.map(p => p.selectedVendorId).filter(Boolean) as number[];
    const vendorAtts = vendorAttIds.length > 0
      ? await db.select({ id: prVendorAttachmentsTable.id, vendorName: prVendorAttachmentsTable.vendorName })
        .from(prVendorAttachmentsTable).where(inArray(prVendorAttachmentsTable.id, vendorAttIds))
      : [];
    const vendorAttMap = new Map(vendorAtts.map(v => [v.id, v.vendorName]));

    const vendorLeadMap = new Map<string, number[]>();
    for (const pr of closedPRs) {
      if (!pr.receivingClosedAt) continue;
      const po = poByPrId.get(pr.id);
      let startDate: Date | null = null;
      let vendorName: string | null = null;

      if (po && po.issuedAt) {
        startDate = po.issuedAt;
        vendorName = po.supplier;
      } else if (pr.vendorSelectedAt && pr.selectedVendorId) {
        startDate = pr.vendorSelectedAt;
        vendorName = vendorAttMap.get(pr.selectedVendorId) || null;
      }

      if (startDate && vendorName && pr.receivingClosedAt) {
        const days = daysBetween(startDate, pr.receivingClosedAt);
        if (!vendorLeadMap.has(vendorName)) vendorLeadMap.set(vendorName, []);
        vendorLeadMap.get(vendorName)!.push(days);
      }
    }

    const vendorLeadTime = Array.from(vendorLeadMap.entries()).map(([vendor, days]) => ({
      vendor,
      avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      count: days.length,
    })).sort((a, b) => b.avgDays - a.avgDays).slice(0, 10);

    // --- Leave Charts ---
    let leaveChartDept: { dept: string; userName: string; userId: number; usedDays: number }[] = [];
    let leaveChartMonthly: { month: number; monthName: string; usedDays: number }[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

    if (isManager) {
      // Manager view: leave taken per user per department this year
      const leaveWhere = prAccessCond
        ? and(eq(purchaseRequestsTable.type, "leave"), sql`EXTRACT(YEAR FROM created_at) = ${currentYear}`, prAccessCond)
        : and(eq(purchaseRequestsTable.type, "leave"), sql`EXTRACT(YEAR FROM created_at) = ${currentYear}`);

      const leavePRs = await db.select({
        requesterId: purchaseRequestsTable.requesterId,
        leaveStartDate: purchaseRequestsTable.leaveStartDate,
        leaveEndDate: purchaseRequestsTable.leaveEndDate,
        department: purchaseRequestsTable.department,
        status: purchaseRequestsTable.status,
      }).from(purchaseRequestsTable).where(leaveWhere);

      const approvedLeave = leavePRs.filter(p => ["approved", "completed"].includes(p.status));
      const userIds = [...new Set(approvedLeave.map(p => p.requesterId))];
      const usersData = userIds.length > 0
        ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
        : [];
      const userNameMap = new Map(usersData.map(u => [u.id, u.name]));

      const deptUserMap = new Map<string, Map<number, number>>();
      for (const lp of approvedLeave) {
        if (!lp.leaveStartDate || !lp.leaveEndDate) continue;
        const start = new Date(lp.leaveStartDate);
        const end = new Date(lp.leaveEndDate);
        const days = daysBetween(start, end) + 1;
        const dept = lp.department || "Lainnya";
        if (!deptUserMap.has(dept)) deptUserMap.set(dept, new Map());
        const userMap = deptUserMap.get(dept)!;
        userMap.set(lp.requesterId, (userMap.get(lp.requesterId) || 0) + days);
      }

      for (const [dept, userMap] of deptUserMap.entries()) {
        for (const [userId, usedDays] of userMap.entries()) {
          leaveChartDept.push({ dept, userId, userName: userNameMap.get(userId) || "Unknown", usedDays });
        }
      }
      leaveChartDept.sort((a, b) => a.dept.localeCompare(b.dept) || b.usedDays - a.usedDays);
    } else {
      // User view: own leave by month in current year
      const ownLeavePRs = await db.select({
        leaveStartDate: purchaseRequestsTable.leaveStartDate,
        leaveEndDate: purchaseRequestsTable.leaveEndDate,
        status: purchaseRequestsTable.status,
      }).from(purchaseRequestsTable)
        .where(and(
          eq(purchaseRequestsTable.requesterId, user.id),
          eq(purchaseRequestsTable.type, "leave"),
          sql`EXTRACT(YEAR FROM created_at) = ${currentYear}`,
        ));

      const monthlyMap = new Map<number, number>();
      for (const lp of ownLeavePRs.filter(p => ["approved", "completed"].includes(p.status))) {
        if (!lp.leaveStartDate) continue;
        const month = new Date(lp.leaveStartDate).getMonth() + 1;
        const start = new Date(lp.leaveStartDate);
        const end = lp.leaveEndDate ? new Date(lp.leaveEndDate) : start;
        const days = daysBetween(start, end) + 1;
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + days);
      }

      for (let m = 1; m <= 12; m++) {
        leaveChartMonthly.push({ month: m, monthName: monthNames[m - 1], usedDays: monthlyMap.get(m) || 0 });
      }
    }

    res.json({
      pendingApprovals: Number(pendingApprovalsResult[0]?.count) || 0,
      myPendingPRs: Number(myPRsResult[0]?.count) || 0,
      pendingPOs: pendingPOsCount,
      totalPRs: Number(totalPRsResult[0]?.count) || 0,
      recentPRs: formatPRList(recentPRsRaw),
      recentLeavePRs: formatPRList(recentLeavePRsRaw),
      prByStatus: prByStatusResult.map(r => ({ status: r.status, count: Number(r.count) })),
      vendorLeadTime,
      leaveChartDept,
      leaveChartMonthly,
      isManager,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
