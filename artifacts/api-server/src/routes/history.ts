import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, purchaseOrdersTable, poItemsTable, usersTable } from "@workspace/db/schema";
import { eq, ne, desc, count, sum, and, like, gte, lte, inArray, SQL, or, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// PR History - filtered by company and department
router.get("/pr", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;

  try {
    const conditions: SQL[] = [];

    if (user.role === "admin") {
      // Admin: sees all PRs
    } else if (user.role === "approver") {
      // Approver: same department AND same company
      const deptCond = eq(purchaseRequestsTable.department, user.department);
      const companyConds: SQL[] = [];
      if (user.hiredCompanyId) {
        companyConds.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
      }
      // company null also visible if user has no company filter
      const companyFilter = companyConds.length > 0
        ? or(companyConds[0])
        : undefined;
      if (companyFilter) {
        conditions.push(and(deptCond, companyFilter)!);
      } else {
        conditions.push(deptCond);
      }
    } else {
      // User / purchasing: own PRs only, same company
      const ownerCond = eq(purchaseRequestsTable.requesterId, user.id);
      if (user.hiredCompanyId) {
        conditions.push(and(ownerCond, or(
          eq(purchaseRequestsTable.companyId, user.hiredCompanyId),
        ))!);
      } else {
        conditions.push(ownerCond);
      }
    }

    // Exclude transfer PRs from general PR history (they have their own tab)
    conditions.push(ne(purchaseRequestsTable.type, "transfer"));

    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseRequestsTable.createdAt, end));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(whereClause)
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const requesterIds = [...new Set(rows.map(r => r.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));

    const result = rows.map(pr => ({
      id: pr.id, prNumber: pr.prNumber, description: pr.description,
      type: pr.type, status: pr.status, department: pr.department,
      totalAmount: parseFloat(pr.totalAmount), notes: pr.notes,
      createdAt: pr.createdAt, updatedAt: pr.updatedAt,
      requesterName: requesterMap.get(pr.requesterId) || "Unknown",
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PO History - filtered by company (via linked PR)
router.get("/po", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;

  try {
    const conditions: SQL[] = [];
    if (status) conditions.push(eq(purchaseOrdersTable.status, status));
    if (search) conditions.push(like(purchaseOrdersTable.poNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseOrdersTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseOrdersTable.createdAt, end));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch all POs matching basic filters
    const [rows, totalAllResult] = await Promise.all([
      db.select().from(purchaseOrdersTable).where(whereClause).orderBy(desc(purchaseOrdersTable.createdAt)),
      db.select({ count: count() }).from(purchaseOrdersTable).where(whereClause),
    ]);

    // For non-admin: filter POs by linked PR's company and (for approver) department
    let filteredRows = rows;
    if (user.role !== "admin") {
      const prIds = [...new Set(rows.map(r => r.prId))];
      if (prIds.length > 0) {
        const linkedPRs = await db.select({
          id: purchaseRequestsTable.id,
          companyId: purchaseRequestsTable.companyId,
          department: purchaseRequestsTable.department,
        }).from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, prIds));

        const allowedPrIds = new Set(linkedPRs.filter(p => {
          const companyMatch = user.hiredCompanyId ? p.companyId === user.hiredCompanyId : true;
          if (user.role === "approver") {
            return companyMatch && p.department === user.department;
          }
          return companyMatch;
        }).map(p => p.id));

        filteredRows = rows.filter(r => allowedPrIds.has(r.prId));
      } else {
        filteredRows = [];
      }
    }

    const total = user.role === "admin" ? Number(totalAllResult[0]?.count) || 0 : filteredRows.length;
    const pagedRows = filteredRows.slice(offset, offset + limit);

    const creatorIds = [...new Set(pagedRows.map(r => r.createdById))];
    const creators = creatorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, creatorIds))
      : [];
    const creatorMap = new Map(creators.map(c => [c.id, c.name]));

    const result = await Promise.all(pagedRows.map(async (po) => {
      const items = await db.select({ id: poItemsTable.id }).from(poItemsTable).where(eq(poItemsTable.poId, po.id));
      return {
        id: po.id, poNumber: po.poNumber, status: po.status, prId: po.prId,
        vendorName: po.supplier || "—",
        totalAmount: parseFloat(po.totalAmount), notes: po.notes,
        createdAt: po.createdAt, updatedAt: po.updatedAt,
        createdByName: creatorMap.get(po.createdById) || "Unknown",
        itemCount: items.length,
      };
    }));

    res.json({ items: result, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Payment History - Finance dept only, filtered by company
router.get("/payment", async (req, res) => {
  const user = req.user!;
  if (user.role !== "admin" && user.department !== "Finance") {
    res.status(403).json({ error: "Hanya departemen Finance yang dapat mengakses riwayat pembayaran" });
    return;
  }
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;

  try {
    const paymentStatuses = ["approved", "payment_pending", "payment_rejected", "paid"];
    const conditions: SQL[] = [
      eq(purchaseRequestsTable.type, "pembayaran"),
      inArray(purchaseRequestsTable.status, status ? [status] : paymentStatuses),
    ];

    // Finance (non-admin): filter by same company
    if (user.role !== "admin" && user.hiredCompanyId) {
      conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    }

    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseRequestsTable.createdAt, end));
    }

    const whereClause = and(...conditions);
    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable).where(whereClause).orderBy(desc(purchaseRequestsTable.updatedAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const requesterIds = [...new Set(rows.map(r => r.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));

    const result = rows.map(pr => ({
      id: pr.id, prNumber: pr.prNumber, description: pr.description,
      status: pr.status, department: pr.department,
      totalAmount: parseFloat(pr.totalAmount), notes: pr.notes,
      createdAt: pr.createdAt, updatedAt: pr.updatedAt,
      requesterName: requesterMap.get(pr.requesterId) || "Unknown",
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Leave History - filtered by company and department
router.get("/leave", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;

  try {
    const conditions: SQL[] = [eq(purchaseRequestsTable.type, "leave")];

    if (user.role === "admin") {
      // Admin: all leave PRs
    } else if (user.role === "approver") {
      conditions.push(eq(purchaseRequestsTable.department, user.department));
      if (user.hiredCompanyId) conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    } else {
      // user / purchasing: own leaves within same company
      conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
      if (user.hiredCompanyId) conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    }

    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.leaveStartDate, new Date(dateFrom) as any));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseRequestsTable.leaveStartDate, end as any));
    }

    const whereClause = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(whereClause)
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const requesterIds = [...new Set(rows.map(r => r.requesterId))];
    const requesters = requesterIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, requesterIds))
      : [];
    const requesterMap = new Map(requesters.map(r => [r.id, r.name]));

    const result = rows.map(pr => {
      const start = pr.leaveStartDate ? new Date(pr.leaveStartDate) : null;
      const end = pr.leaveEndDate ? new Date(pr.leaveEndDate) : null;
      const days = start && end ? Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1 : null;
      return {
        id: pr.id, prNumber: pr.prNumber, description: pr.description,
        status: pr.status, department: pr.department,
        leaveStartDate: pr.leaveStartDate,
        leaveEndDate: pr.leaveEndDate,
        days,
        createdAt: pr.createdAt,
        requesterName: requesterMap.get(pr.requesterId) || "Unknown",
      };
    });

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Transfer History Summary (item-level breakdown)
router.get("/transfer/summary", async (req, res) => {
  const user = req.user!;
  const fromLocationId = req.query.fromLocationId ? parseInt(req.query.fromLocationId as string) : undefined;
  const toLocationId = req.query.toLocationId ? parseInt(req.query.toLocationId as string) : undefined;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;
  try {
    const conditions: SQL[] = [eq(purchaseRequestsTable.type, "transfer"), eq(purchaseRequestsTable.status, "approved")];
    if (user.role !== "admin") {
      if (user.hiredCompanyId) conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    }
    if (fromLocationId) conditions.push(eq(purchaseRequestsTable.fromLocationId, fromLocationId));
    if (toLocationId) conditions.push(eq(purchaseRequestsTable.toLocationId, toLocationId));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) { const end = new Date(dateTo); end.setHours(23,59,59,999); conditions.push(lte(purchaseRequestsTable.createdAt, end)); }

    const whereClause = and(...conditions);
    const prRows = await db.select({ id: purchaseRequestsTable.id }).from(purchaseRequestsTable).where(whereClause);
    const prIds = prRows.map(r => r.id);
    if (prIds.length === 0) { res.json({ totalPRs: 0, totalItems: 0, totalQty: 0, totalValue: 0, topItems: [] }); return; }

    const { prItemsTable } = await import("@workspace/db/schema");
    const itemRows = await db.select().from(prItemsTable).where(inArray(prItemsTable.prId, prIds));
    const totalQty = itemRows.reduce((s, r) => s + parseFloat(r.qty), 0);
    const totalValue = itemRows.reduce((s, r) => s + parseFloat(r.totalPrice), 0);

    // Top items by qty
    const itemMap = new Map<string, { qty: number; value: number }>();
    for (const item of itemRows) {
      const existing = itemMap.get(item.name) || { qty: 0, value: 0 };
      itemMap.set(item.name, { qty: existing.qty + parseFloat(item.qty), value: existing.value + parseFloat(item.totalPrice) });
    }
    const topItems = [...itemMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5)
      .map(([name, data]) => ({ name, qty: data.qty, value: data.value }));

    res.json({ totalPRs: prIds.length, totalItems: itemRows.length, totalQty, totalValue, topItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Transfer History
router.get("/transfer", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;
  const fromLocId = req.query.fromLocationId ? parseInt(req.query.fromLocationId as string) : undefined;
  const toLocId = req.query.toLocationId ? parseInt(req.query.toLocationId as string) : undefined;

  try {
    const conditions: SQL[] = [eq(purchaseRequestsTable.type, "transfer")];

    if (user.role === "admin") {
      // Admin: all
    } else if (user.role === "approver") {
      conditions.push(eq(purchaseRequestsTable.department, user.department));
      if (user.hiredCompanyId) conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    } else {
      conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
      if (user.hiredCompanyId) conditions.push(eq(purchaseRequestsTable.companyId, user.hiredCompanyId));
    }

    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseRequestsTable.createdAt, end));
    }
    if (fromLocId) conditions.push(eq(purchaseRequestsTable.fromLocationId, fromLocId));
    if (toLocId) conditions.push(eq(purchaseRequestsTable.toLocationId, toLocId));

    const whereClause = and(...conditions);
    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(whereClause)
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    // Collect all user IDs (requesters + recipients)
    const allUserIds = [...new Set([
      ...rows.map(r => r.requesterId),
      ...rows.map(r => r.transferToUserId).filter(Boolean) as number[],
    ])];
    const userRows = allUserIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allUserIds))
      : [];
    const userMap = new Map(userRows.map(r => [r.id, r.name]));

    // Fetch location names
    const locationIds = [...new Set([
      ...rows.map(r => r.fromLocationId).filter(Boolean) as number[],
      ...rows.map(r => r.toLocationId).filter(Boolean) as number[],
    ])];
    let locationMap = new Map<number, string>();
    if (locationIds.length > 0) {
      const locResult = await db.execute(
        sql`SELECT id, name FROM locations WHERE id = ANY(${locationIds})`
      );
      for (const row of (locResult as any).rows || []) {
        locationMap.set(row.id, row.name);
      }
    }

    const result = rows.map(pr => ({
      id: pr.id, prNumber: pr.prNumber, description: pr.description,
      status: pr.status, department: pr.department,
      totalAmount: parseFloat(pr.totalAmount),
      fromLocationId: pr.fromLocationId,
      toLocationId: pr.toLocationId,
      fromLocationName: pr.fromLocationId ? locationMap.get(pr.fromLocationId) || "—" : "—",
      toLocationName: pr.toLocationId ? locationMap.get(pr.toLocationId) || "—" : "—",
      transferToUserId: pr.transferToUserId,
      transferToUserName: pr.transferToUserId ? userMap.get(pr.transferToUserId) || "—" : "—",
      receivingStatus: pr.receivingStatus,
      createdAt: pr.createdAt, updatedAt: pr.updatedAt,
      requesterName: userMap.get(pr.requesterId) || "Unknown",
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
