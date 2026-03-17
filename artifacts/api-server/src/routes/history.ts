import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, purchaseOrdersTable, prItemsTable, poItemsTable, usersTable } from "@workspace/db/schema";
import { eq, desc, count, and, like, gte, lte, inArray, SQL } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// PR History
router.get("/pr", async (req, res) => {
  const user = req.user!;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = [20, 50].includes(parseInt(req.query.limit as string)) ? parseInt(req.query.limit as string) : 20;
  const offset = (page - 1) * limit;
  const status = req.query.status as string;
  const search = req.query.search as string;
  const dateFrom = req.query.dateFrom as string;
  const dateTo = req.query.dateTo as string;
  const type = req.query.type as string;

  try {
    const conditions: SQL[] = [];
    // Non-admin: only their own PRs
    if (user.role !== "admin" && user.role !== "approver") {
      conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    }
    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (type) conditions.push(eq(purchaseRequestsTable.type, type));
    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
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

    const result = await Promise.all(rows.map(async (pr) => {
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      return {
        id: pr.id, prNumber: pr.prNumber, description: pr.description,
        type: pr.type, status: pr.status, department: pr.department,
        totalAmount: parseFloat(pr.totalAmount), notes: pr.notes,
        createdAt: pr.createdAt, updatedAt: pr.updatedAt,
        requesterName: requester?.name || "Unknown",
      };
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PO History
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
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseOrdersTable.createdAt, end));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseOrdersTable)
        .where(whereClause)
        .orderBy(desc(purchaseOrdersTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseOrdersTable).where(whereClause),
    ]);

    const result = await Promise.all(rows.map(async (po) => {
      const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, po.createdBy));
      const items = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, po.id));
      return {
        id: po.id, poNumber: po.poNumber, status: po.status,
        vendorName: po.vendorName, vendorContact: po.vendorContact,
        totalAmount: parseFloat(po.totalAmount), notes: po.notes,
        createdAt: po.createdAt, updatedAt: po.updatedAt,
        createdByName: creator?.name || "Unknown",
        itemCount: items.length,
      };
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Payment History
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
    if (search) conditions.push(like(purchaseRequestsTable.prNumber, `%${search}%`));
    if (dateFrom) conditions.push(gte(purchaseRequestsTable.createdAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(purchaseRequestsTable.createdAt, end));
    }

    const whereClause = and(...conditions);
    const [rows, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(whereClause)
        .orderBy(desc(purchaseRequestsTable.updatedAt))
        .limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const result = await Promise.all(rows.map(async (pr) => {
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      return {
        id: pr.id, prNumber: pr.prNumber, description: pr.description,
        status: pr.status, department: pr.department,
        totalAmount: parseFloat(pr.totalAmount), notes: pr.notes,
        createdAt: pr.createdAt, updatedAt: pr.updatedAt,
        requesterName: requester?.name || "Unknown",
      };
    }));

    res.json({ items: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
