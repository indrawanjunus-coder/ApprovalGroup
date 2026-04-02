import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, prItemsTable, usersTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog, handleRouteError } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

const PAYMENT_STATUSES = ["approved", "payment_pending"];

function canAccessPembayaran(user: any) {
  return user.role === "admin" || user.department === "Finance";
}

// List PRs of type 'pembayaran' that are approved or pending payment
router.get("/", async (req, res) => {
  const user = req.user!;
  if (!canAccessPembayaran(user)) {
    res.status(403).json({ error: "Hanya departemen Finance yang dapat mengakses pembayaran" });
    return;
  }
  try {
    const conditions: any[] = [
      eq(purchaseRequestsTable.type, "pembayaran"),
      inArray(purchaseRequestsTable.status, PAYMENT_STATUSES),
    ];

    const prs = await db.select().from(purchaseRequestsTable).where(and(...conditions));
    const items: any[] = [];
    for (const pr of prs) {
      const [requester] = await db.select({ name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, pr.requesterId));
      const prItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, pr.id));
      items.push({
        id: pr.id, prId: pr.id, prNumber: pr.prNumber, prDescription: pr.description,
        requesterName: requester?.name || "Unknown", department: pr.department,
        totalAmount: parseFloat(pr.totalAmount), status: pr.status,
        notes: pr.notes, createdAt: pr.createdAt, items: prItems,
      });
    }
    res.json({ items, total: items.length });
  } catch (err) { handleRouteError(res, err); }
});

// Update payment status: payment_pending | payment_rejected | paid
router.put("/:id/status", async (req, res) => {
  const user = req.user!;
  if (!canAccessPembayaran(user)) {
    res.status(403).json({ error: "Hanya departemen Finance yang dapat memproses pembayaran" });
    return;
  }
  const id = parseInt(req.params.id);
  const { status, notes } = req.body;

  const ALLOWED_STATUSES = ["payment_pending", "payment_rejected", "paid"];
  if (!ALLOWED_STATUSES.includes(status)) {
    res.status(400).json({ error: "Status tidak valid. Gunakan: payment_pending, payment_rejected, atau paid" });
    return;
  }

  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "PR tidak ditemukan" }); return; }
    if (pr.type !== "pembayaran") { res.status(400).json({ error: "Bukan jenis request pembayaran" }); return; }
    if (!PAYMENT_STATUSES.includes(pr.status)) {
      res.status(400).json({ error: "Status PR tidak memungkinkan untuk diubah" }); return;
    }

    const notePrefix: Record<string, string> = {
      payment_pending: "[Menunggu Pembayaran]",
      payment_rejected: "[Pembayaran Ditolak]",
      paid: "[Dibayar]",
    };
    const updatedNotes = notes
      ? (pr.notes ? `${pr.notes}\n${notePrefix[status]} ${notes}` : `${notePrefix[status]} ${notes}`)
      : pr.notes;

    const [updated] = await db.update(purchaseRequestsTable)
      .set({ status, notes: updatedNotes, updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id))
      .returning();

    const actionLabel: Record<string, string> = {
      payment_pending: "ditandai menunggu pembayaran",
      payment_rejected: "ditolak pembayarannya",
      paid: "selesai dibayar",
    };
    await createAuditLog(user.id, `payment_${status}`, "pr", id, `PR ${pr.prNumber} ${actionLabel[status]}`);
    res.json({ success: true, pr: updated });
  } catch (err) { handleRouteError(res, err); }
});

// Legacy process endpoint (kept for backward compatibility → maps to 'paid')
router.post("/:id/process", async (req, res) => {
  const user = req.user!;
  if (!canAccessPembayaran(user)) {
    res.status(403).json({ error: "Hanya departemen Finance yang dapat memproses pembayaran" });
    return;
  }
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "PR tidak ditemukan" }); return; }
    if (pr.type !== "pembayaran") { res.status(400).json({ error: "Bukan jenis request pembayaran" }); return; }
    if (!PAYMENT_STATUSES.includes(pr.status)) {
      res.status(400).json({ error: "Status PR tidak memungkinkan untuk diproses" }); return;
    }
    const updatedNotes = notes
      ? (pr.notes ? `${pr.notes}\n[Dibayar] ${notes}` : `[Dibayar] ${notes}`)
      : pr.notes;
    const [updated] = await db.update(purchaseRequestsTable)
      .set({ status: "paid", notes: updatedNotes, updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id)).returning();
    await createAuditLog(user.id, "payment_paid", "pr", id, `Pembayaran selesai untuk PR ${pr.prNumber}`);
    res.json({ success: true, pr: updated });
  } catch (err) { handleRouteError(res, err); }
});

export default router;
