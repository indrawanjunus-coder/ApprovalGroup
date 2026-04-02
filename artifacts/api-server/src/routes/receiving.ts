import { Router } from "express";
import { db } from "@workspace/db";
import { purchaseRequestsTable, purchaseOrdersTable, prVendorAttachmentsTable, usersTable } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { handleRouteError } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  try {
    const items: any[] = [];

    // PO-ON flow: issued POs (purchasing created PO, now user receives)
    const issuedPOs = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.status, "issued"));
    for (const po of issuedPOs) {
      const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId));
      if (!pr) continue;
      if (pr.type === "pembayaran") continue; // pembayaran type goes to Pembayaran page
      if (user.role === "user" && pr.requesterId !== user.id) continue;
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      items.push({
        id: po.id, type: "po", prId: pr.id, prNumber: pr.prNumber, prDescription: pr.description,
        requesterName: requester?.name || "Unknown", department: pr.department,
        vendorName: po.supplier, totalAmount: parseFloat(po.totalAmount),
        status: po.status, poId: po.id, poNumber: po.poNumber,
      });
    }

    // PO-OFF flow: vendor_selected PRs waiting for receiving
    const vsConditions: any[] = [eq(purchaseRequestsTable.status, "vendor_selected")];
    if (user.role === "user") vsConditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    const vsPRs = await db.select().from(purchaseRequestsTable).where(and(...vsConditions));
    for (const pr of vsPRs) {
      if (pr.type === "pembayaran") continue; // pembayaran type goes to Pembayaran page
      if (user.role === "user" && pr.requesterId !== user.id) continue;
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      const selectedVendor = pr.selectedVendorId
        ? await db.select({ vendorName: prVendorAttachmentsTable.vendorName }).from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.id, pr.selectedVendorId))
        : [];
      items.push({
        id: pr.id, type: "pr", prId: pr.id, prNumber: pr.prNumber, prDescription: pr.description,
        requesterName: requester?.name || "Unknown", department: pr.department,
        vendorName: selectedVendor[0]?.vendorName || null,
        totalAmount: pr.vendorFinalAmount ? parseFloat(pr.vendorFinalAmount) : parseFloat(pr.totalAmount),
        status: pr.status, poId: null, poNumber: null,
      });
    }

    res.json({ items, total: items.length });
  } catch (err) { handleRouteError(res, err); }
});

export default router;
