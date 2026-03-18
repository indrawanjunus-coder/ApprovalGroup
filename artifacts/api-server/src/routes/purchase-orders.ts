import { Router } from "express";
import { sendPOCreatedEmail, sendReceivingReadyEmail, sendPOIssuedEmail } from "../lib/email.js";
import { db } from "@workspace/db";
import { purchaseOrdersTable, poItemsTable, purchaseRequestsTable, usersTable, settingsTable, approvalsTable, companiesTable } from "@workspace/db/schema";
import { eq, desc, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { generatePONumber } from "../lib/prNumber.js";

const router = Router();
router.use(requireAuth);

function formatPO(po: any, items: any[]) {
  return {
    ...po,
    totalAmount: parseFloat(po.totalAmount),
    items: items.map(i => ({
      ...i,
      qty: parseFloat(i.qty),
      negotiatedPrice: parseFloat(i.negotiatedPrice),
      totalPrice: parseFloat(i.totalPrice),
    })),
  };
}

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string;
  const offset = (page - 1) * limit;

  try {
    let query = db.select().from(purchaseOrdersTable);
    let countQuery = db.select({ count: count() }).from(purchaseOrdersTable);

    if (status) {
      query = query.where(eq(purchaseOrdersTable.status, status)) as any;
      countQuery = countQuery.where(eq(purchaseOrdersTable.status, status)) as any;
    }

    const [pos, totalResult] = await Promise.all([
      query.orderBy(desc(purchaseOrdersTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    const poIds = pos.map(p => p.id);
    const items = poIds.length > 0
      ? await db.select().from(poItemsTable).where(inArray(poItemsTable.poId, poIds))
      : [];

    const prIds = [...new Set(pos.map(p => p.prId))];
    const prs = prIds.length > 0
      ? await db.select({ id: purchaseRequestsTable.id, prNumber: purchaseRequestsTable.prNumber }).from(purchaseRequestsTable).where(inArray(purchaseRequestsTable.id, prIds))
      : [];
    const prMap = new Map(prs.map(p => [p.id, p.prNumber]));

    const creatorIds = [...new Set(pos.map(p => p.createdById))];
    const creators = creatorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, creatorIds))
      : [];
    const creatorMap = new Map(creators.map(c => [c.id, c.name]));

    const result = pos.map(po => {
      const poItems = items.filter(i => i.poId === po.id);
      return formatPO({ ...po, prNumber: prMap.get(po.prId) || "Unknown", createdByName: creatorMap.get(po.createdById) || "Unknown" }, poItems);
    });

    res.json({ purchaseOrders: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin", "purchasing"), async (req, res) => {
  const user = req.user!;
  const { prId, supplier, items, notes } = req.body;
  if (!prId || !supplier || !items || !Array.isArray(items)) {
    res.status(400).json({ error: "Bad Request" }); return;
  }
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, prId));
    if (!pr) { res.status(404).json({ error: "PR not found" }); return; }
    if (pr.status !== "approved") {
      res.status(400).json({ error: "Bad Request", message: "PR must be approved first" }); return;
    }
    const poNumber = await generatePONumber();
    const totalAmount = items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.negotiatedPrice)), 0);
    const [po] = await db.insert(purchaseOrdersTable).values({
      poNumber,
      prId,
      supplier,
      status: "draft",
      totalAmount: totalAmount.toString(),
      notes,
      createdById: user.id,
    }).returning();
    const poItems = await db.insert(poItemsTable).values(
      items.map((item: any) => ({
        poId: po.id,
        prItemId: item.prItemId || null,
        name: item.name,
        qty: item.qty.toString(),
        unit: item.unit,
        negotiatedPrice: item.negotiatedPrice.toString(),
        totalPrice: (parseFloat(item.qty) * parseFloat(item.negotiatedPrice)).toString(),
      }))
    ).returning();
    await createAuditLog(user.id, "create_po", "po", po.id, `Created PO ${poNumber}`);
    await createNotification(pr.requesterId, "PO Dibuat", `PO ${poNumber} telah dibuat dari PR ${pr.prNumber}`, "info", prId, po.id);
    res.status(201).json(formatPO({ ...po, prNumber: pr.prNumber, createdByName: user.name }, poItems));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "Not Found" }); return; }
    const [items, pr, creator, approvalsRaw] = await Promise.all([
      db.select().from(poItemsTable).where(eq(poItemsTable.poId, id)),
      db.select({
        prNumber: purchaseRequestsTable.prNumber,
        requesterId: purchaseRequestsTable.requesterId,
        department: purchaseRequestsTable.department,
        description: purchaseRequestsTable.description,
        notes: purchaseRequestsTable.notes,
        companyId: purchaseRequestsTable.companyId,
      }).from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId)),
      db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, po.createdById)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, po.prId)),
    ]);
    const prRow = pr[0];
    let companyName: string | null = null;
    if (prRow?.companyId) {
      const [comp] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, prRow.companyId));
      companyName = comp?.name || null;
    }
    const approverIds = [...new Set(approvalsRaw.map((a: any) => a.approverId))];
    const approverUsers = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name, signature: usersTable.signature }).from(usersTable).where(inArray(usersTable.id, approverIds as number[]))
      : [];
    const userMap = new Map(approverUsers.map(u => [u.id, u.name]));
    const signatureMap = new Map(approverUsers.map(u => [u.id, u.signature]));
    const approvals = approvalsRaw.map((a: any) => ({ ...a, approverName: userMap.get(a.approverId) || "Unknown", approverSignature: signatureMap.get(a.approverId) || null }));
    const enrichedPR = {
      prNumber: prRow?.prNumber || "Unknown",
      requesterName: creator[0]?.name || "Unknown",
      department: prRow?.department || null,
      description: prRow?.description || null,
      notes: prRow?.notes || null,
      companyName,
    };
    res.json({ ...formatPO({ ...po, prNumber: enrichedPR.prNumber, createdByName: creator[0]?.name || "Unknown" }, items), pr: enrichedPR, approvals });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin", "purchasing"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { supplier, items, notes } = req.body;
  try {
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "Not Found" }); return; }
    if (po.status !== "draft") {
      res.status(400).json({ error: "Can only edit draft POs" }); return;
    }
    const totalAmount = items
      ? items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.negotiatedPrice)), 0)
      : parseFloat(po.totalAmount);
    const [updated] = await db.update(purchaseOrdersTable).set({ supplier: supplier || po.supplier, totalAmount: totalAmount.toString(), notes, updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, id)).returning();
    if (items) {
      await db.delete(poItemsTable).where(eq(poItemsTable.poId, id));
      await db.insert(poItemsTable).values(items.map((item: any) => ({
        poId: id, prItemId: item.prItemId || null, name: item.name,
        qty: item.qty.toString(), unit: item.unit,
        negotiatedPrice: item.negotiatedPrice.toString(),
        totalPrice: (parseFloat(item.qty) * parseFloat(item.negotiatedPrice)).toString(),
      })));
    }
    const newItems = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, id));
    const [pr] = await db.select({ prNumber: purchaseRequestsTable.prNumber }).from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId));
    const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, po.createdById));
    res.json(formatPO({ ...updated, prNumber: pr?.prNumber || "Unknown", createdByName: creator?.name || "Unknown" }, newItems));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/issue", requireRole("admin", "purchasing"), async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "Not Found" }); return; }
    const issuedAt = new Date();
    const [updated] = await db.update(purchaseOrdersTable).set({ status: "issued", issuedAt, updatedAt: issuedAt }).where(eq(purchaseOrdersTable.id, id)).returning();
    const [pr] = await db.select({ prNumber: purchaseRequestsTable.prNumber, requesterId: purchaseRequestsTable.requesterId }).from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId));
    if (pr) {
      await createNotification(pr.requesterId, "PO Diterbitkan", `PO ${po.poNumber} telah diterbitkan untuk PR ${pr.prNumber}`, "received", po.prId, id);
      const [requester] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      if (requester?.email) {
        sendPOIssuedEmail(requester.email, requester.name, pr.prNumber, po.poNumber, po.supplier || "—", parseFloat(po.totalAmount)).catch(() => {});
        sendReceivingReadyEmail(requester.email, requester.name, pr.prNumber, po.poNumber).catch(() => {});
      }
    }
    await createAuditLog(user.id, "issue_po", "po", id);
    const items = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, id));
    const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, po.createdById));
    res.json(formatPO({ ...updated, prNumber: pr?.prNumber || "Unknown", createdByName: creator?.name || "Unknown" }, items));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/receive", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "Not Found" }); return; }
    if (po.status !== "issued") {
      res.status(400).json({ error: "PO must be issued first" }); return;
    }
    const [updated] = await db.update(purchaseOrdersTable).set({ status: "received", updatedAt: new Date() }).where(eq(purchaseOrdersTable.id, id)).returning();
    await createAuditLog(user.id, "receive_po", "po", id);
    const [pr] = await db.select({ prNumber: purchaseRequestsTable.prNumber, requesterId: purchaseRequestsTable.requesterId }).from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId));
    if (pr) {
      await db.update(purchaseRequestsTable).set({ status: "completed", updatedAt: new Date() }).where(eq(purchaseRequestsTable.id, po.prId));
    }
    const items = await db.select().from(poItemsTable).where(eq(poItemsTable.poId, id));
    const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, po.createdById));
    res.json(formatPO({ ...updated, prNumber: pr?.prNumber || "Unknown", createdByName: creator?.name || "Unknown" }, items));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    if (!po) { res.status(404).json({ error: "Not Found" }); return; }
    await db.delete(poItemsTable).where(eq(poItemsTable.poId, id));
    await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
    await createAuditLog(user.id, "delete_po", "po", id, `Deleted PO ${po.poNumber}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
