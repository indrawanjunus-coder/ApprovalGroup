import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, prItemsTable, usersTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// List PRs of type 'pembayaran' that are pending payment processing
router.get("/", async (req, res) => {
  const user = req.user!;
  try {
    const conditions: any[] = [
      eq(purchaseRequestsTable.type, "pembayaran"),
      inArray(purchaseRequestsTable.status, ["approved", "vendor_selected"]),
    ];
    if (user.role === "user") conditions.push(eq(purchaseRequestsTable.requesterId, user.id));

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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Mark a pembayaran PR as processed/paid
router.post("/:id/process", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "PR tidak ditemukan" }); return; }
    if (pr.type !== "pembayaran") { res.status(400).json({ error: "Bukan jenis request pembayaran" }); return; }
    if (!["approved", "vendor_selected"].includes(pr.status)) {
      res.status(400).json({ error: "Status PR tidak memungkinkan untuk diproses" }); return;
    }
    if (user.role !== "admin" && user.role !== "purchasing") {
      res.status(403).json({ error: "Hanya admin atau purchasing yang dapat memproses pembayaran" }); return;
    }

    const [updated] = await db.update(purchaseRequestsTable)
      .set({ status: "closed", notes: notes ? (pr.notes ? pr.notes + "\n[Pembayaran] " + notes : "[Pembayaran] " + notes) : pr.notes, updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id))
      .returning();

    await createAuditLog(user.id, "process_payment", "pr", id, `Pembayaran diproses untuk PR ${pr.prNumber}`);
    res.json({ success: true, pr: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
