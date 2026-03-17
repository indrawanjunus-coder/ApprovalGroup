import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, prItemsTable, approvalsTable, approvalRulesTable,
  approvalRuleLevelsTable, usersTable, companiesTable, prVendorAttachmentsTable,
  purchaseOrdersTable
} from "@workspace/db/schema";
import { eq, desc, ilike, and, inArray, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { generatePRNumber } from "../lib/prNumber.js";

const router = Router();
router.use(requireAuth);

function parsePRRow(pr: any) {
  return {
    ...pr,
    totalAmount: parseFloat(pr.totalAmount || "0"),
    vendorFinalQty: pr.vendorFinalQty ? parseFloat(pr.vendorFinalQty) : null,
    vendorFinalAmount: pr.vendorFinalAmount ? parseFloat(pr.vendorFinalAmount) : null,
  };
}

async function buildFullPR(pr: any, items: any[], approvals: any[], vendorAttachments: any[] = []) {
  let companyName: string | null = null;
  if (pr.companyId) {
    const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, pr.companyId));
    companyName = c?.name || null;
  }
  let leaveRequesterName: string | null = null;
  if (pr.leaveRequesterId) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.leaveRequesterId));
    leaveRequesterName = u?.name || null;
  }
  let selectedVendorName: string | null = null;
  let vendorSelectedByName: string | null = null;
  if (pr.selectedVendorId) {
    const va = vendorAttachments.find((v: any) => v.id === pr.selectedVendorId);
    selectedVendorName = va?.vendorName || null;
  }
  if (pr.vendorSelectedBy) {
    const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.vendorSelectedBy));
    vendorSelectedByName = u?.name || null;
  }
  return {
    ...parsePRRow(pr),
    companyName,
    leaveRequesterName,
    selectedVendorName,
    vendorSelectedByName,
    items: items.map(i => ({
      ...i,
      qty: parseFloat(i.qty),
      estimatedPrice: parseFloat(i.estimatedPrice),
      totalPrice: parseFloat(i.totalPrice),
    })),
    approvals,
    vendorAttachments,
  };
}

router.get("/", async (req, res) => {
  const user = req.user!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const status = req.query.status as string;
  const type = req.query.type as string;
  const search = req.query.search as string;
  const offset = (page - 1) * limit;

  try {
    let conditions: any[] = [];
    if (user.role === "user") conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    if (status) conditions.push(eq(purchaseRequestsTable.status, status));
    if (type) conditions.push(eq(purchaseRequestsTable.type, type));
    if (search) conditions.push(ilike(purchaseRequestsTable.description, `%${search}%`));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [prs, totalResult] = await Promise.all([
      db.select().from(purchaseRequestsTable).where(whereClause).orderBy(desc(purchaseRequestsTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: count() }).from(purchaseRequestsTable).where(whereClause),
    ]);

    const prIds = prs.map(p => p.id);
    const [items, approvalsData, requesterData, vendorAttachments] = await Promise.all([
      prIds.length > 0 ? db.select().from(prItemsTable).where(inArray(prItemsTable.prId, prIds)) : [],
      prIds.length > 0 ? db.select().from(approvalsTable).where(inArray(approvalsTable.prId, prIds)) : [],
      prs.length > 0 ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, prs.map(p => p.requesterId))) : [],
      prIds.length > 0 ? db.select().from(prVendorAttachmentsTable).where(inArray(prVendorAttachmentsTable.prId, prIds)) : [],
    ]);

    const approverIds = [...new Set(approvalsData.map(a => a.approverId))];
    const uploaderIds = [...new Set(vendorAttachments.map((v: any) => v.uploadedBy))];
    const allUserIds = [...new Set([...approverIds, ...uploaderIds])];
    const allUsers = allUserIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allUserIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));
    const requesterMap = new Map(requesterData.map(r => [r.id, r.name]));

    const companyIds = [...new Set(prs.filter(p => p.companyId).map(p => p.companyId!))];
    const companies = companyIds.length > 0
      ? await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(inArray(companiesTable.id, companyIds))
      : [];
    const companyMap = new Map(companies.map(c => [c.id, c.name]));

    const result = prs.map(pr => {
      const prItems = items.filter(i => i.prId === pr.id);
      const prApprovals = approvalsData.filter(a => a.prId === pr.id).map(a => ({
        ...a, approverName: userMap.get(a.approverId) || "Unknown"
      }));
      const prVendors = vendorAttachments
        .filter((v: any) => v.prId === pr.id)
        .map((v: any) => ({
          ...v,
          quotedPrice: v.quotedPrice ? parseFloat(v.quotedPrice) : null,
          uploaderName: userMap.get(v.uploadedBy) || "Unknown",
        }));
      const selectedVendor = prVendors.find((v: any) => v.id === pr.selectedVendorId);
      return {
        ...parsePRRow(pr),
        requesterName: requesterMap.get(pr.requesterId) || "Unknown",
        companyName: pr.companyId ? companyMap.get(pr.companyId) || null : null,
        leaveRequesterName: null,
        selectedVendorName: selectedVendor?.vendorName || null,
        vendorSelectedByName: null,
        items: prItems.map(i => ({ ...i, qty: parseFloat(i.qty), estimatedPrice: parseFloat(i.estimatedPrice), totalPrice: parseFloat(i.totalPrice) })),
        approvals: prApprovals,
        vendorAttachments: prVendors,
      };
    });

    res.json({ purchaseRequests: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  const user = req.user!;
  const { type, description, items, notes, companyId, department, leaveStartDate, leaveEndDate, leaveRequesterId } = req.body;
  if (!type || !description) { res.status(400).json({ error: "Bad Request", message: "Missing required fields" }); return; }
  if (type !== "leave" && (!items || !Array.isArray(items) || items.length === 0)) {
    res.status(400).json({ error: "Bad Request", message: "Items required for this request type" }); return;
  }
  try {
    const prNumber = await generatePRNumber();
    const totalAmount = type === "leave" ? 0 : (items || []).reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0);
    const [pr] = await db.insert(purchaseRequestsTable).values({
      prNumber, requesterId: user.id, department: department || user.department,
      companyId: companyId || null, type, description, status: "draft",
      totalAmount: totalAmount.toString(), notes,
      leaveStartDate: leaveStartDate || null, leaveEndDate: leaveEndDate || null,
      leaveRequesterId: leaveRequesterId || user.id,
    }).returning();

    let prItems: any[] = [];
    if (type !== "leave" && items?.length > 0) {
      prItems = await db.insert(prItemsTable).values(
        items.map((item: any) => ({
          prId: pr.id, name: item.name, description: item.description,
          qty: item.qty.toString(), unit: item.unit,
          estimatedPrice: item.estimatedPrice.toString(),
          totalPrice: (parseFloat(item.qty) * parseFloat(item.estimatedPrice)).toString(),
        }))
      ).returning();
    }
    await createAuditLog(user.id, "create_pr", "pr", pr.id, `Created PR ${prNumber}`);
    res.status(201).json(await buildFullPR({ ...pr, requesterName: user.name }, prItems, []));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    const [items, approvalsData, requester, vendorAttachments] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, id)),
      db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId)),
      db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id)),
    ]);
    const approverIds = approvalsData.map(a => a.approverId);
    const uploaderIds = [...new Set(vendorAttachments.map((v: any) => v.uploadedBy))];
    const allIds = [...new Set([...approverIds, ...uploaderIds])];
    const allUsers = allIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));
    const enrichedVendors = vendorAttachments.map((v: any) => ({
      ...v,
      quotedPrice: v.quotedPrice ? parseFloat(v.quotedPrice) : null,
      uploaderName: userMap.get(v.uploadedBy) || "Unknown",
    }));
    const approvalsWithNames = approvalsData.map(a => ({ ...a, approverName: userMap.get(a.approverId) || "Unknown" }));
    res.json(await buildFullPR({ ...pr, requesterName: requester[0]?.name || "Unknown" }, items, approvalsWithNames, enrichedVendors));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.put("/:id", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { type, description, items, notes, companyId, leaveStartDate, leaveEndDate, leaveRequesterId } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") { res.status(400).json({ error: "Can only edit draft PRs" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    const totalAmount = items
      ? items.reduce((sum: number, item: any) => sum + (parseFloat(item.qty) * parseFloat(item.estimatedPrice)), 0)
      : parseFloat(pr.totalAmount);
    const [updated] = await db.update(purchaseRequestsTable).set({
      type: type || pr.type, description: description || pr.description,
      companyId: companyId !== undefined ? companyId : pr.companyId,
      totalAmount: totalAmount.toString(), notes,
      leaveStartDate: leaveStartDate !== undefined ? leaveStartDate : pr.leaveStartDate,
      leaveEndDate: leaveEndDate !== undefined ? leaveEndDate : pr.leaveEndDate,
      leaveRequesterId: leaveRequesterId !== undefined ? leaveRequesterId : pr.leaveRequesterId,
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();
    if (items) {
      await db.delete(prItemsTable).where(eq(prItemsTable.prId, id));
      if (items.length > 0) {
        await db.insert(prItemsTable).values(items.map((item: any) => ({
          prId: id, name: item.name, description: item.description,
          qty: item.qty.toString(), unit: item.unit,
          estimatedPrice: item.estimatedPrice.toString(),
          totalPrice: (parseFloat(item.qty) * parseFloat(item.estimatedPrice)).toString(),
        })));
      }
    }
    const newItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    await createAuditLog(user.id, "update_pr", "pr", id);
    res.json(await buildFullPR({ ...updated, requesterName: requester?.name || "Unknown" }, newItems, [], []));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/submit", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") { res.status(400).json({ error: "PR is not in draft status" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const amount = parseFloat(pr.totalAmount);
    const allRules = await db.select().from(approvalRulesTable).where(eq(approvalRulesTable.type, pr.type));
    let matchingRule = allRules.find(r => r.companyId === pr.companyId && r.department === pr.department)
      || allRules.find(r => r.companyId === pr.companyId && !r.department)
      || allRules.find(r => !r.companyId && r.department === pr.department)
      || allRules.find(r => !r.companyId && !r.department);

    if (!matchingRule) {
      res.status(400).json({ error: "Bad Request", message: "Tidak ditemukan aturan approval. Hubungi Admin." }); return;
    }

    const allLevels = await db.select().from(approvalRuleLevelsTable).where(eq(approvalRuleLevelsTable.ruleId, matchingRule.id));
    const applicableLevels = pr.type === "leave" ? allLevels : allLevels.filter(l => {
      const min = l.minAmount ? parseFloat(l.minAmount) : 0;
      const max = l.maxAmount ? parseFloat(l.maxAmount) : Infinity;
      return amount >= min && amount <= max;
    });

    if (applicableLevels.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "Tidak ada approver yang sesuai. Hubungi Admin." }); return;
    }

    await db.insert(approvalsTable).values(
      applicableLevels.map(l => ({ prId: id, approverId: l.approverId!, level: l.level, status: "pending" }))
    );
    const minLevel = Math.min(...applicableLevels.map(l => l.level));
    const [updated] = await db.update(purchaseRequestsTable).set({
      status: "waiting_approval", currentApprovalLevel: minLevel, updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    for (const l of applicableLevels.filter(l => l.level === minLevel)) {
      await createNotification(l.approverId!, "PR Perlu Disetujui",
        `PR ${pr.prNumber} dari ${user.name} membutuhkan persetujuan Anda`, "approval_request", id);
    }
    await createAuditLog(user.id, "submit_pr", "pr", id, `PR ${pr.prNumber} submitted`);

    const [items, approvals] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, id)),
    ]);
    const approverIds = approvals.map(a => a.approverId);
    const approvers = approverIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, approverIds))
      : [];
    const approverMap = new Map(approvers.map(a => [a.id, a.name]));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));

    res.json(await buildFullPR(
      { ...updated, requesterName: requester?.name || user.name },
      items,
      approvals.map(a => ({ ...a, approverName: approverMap.get(a.approverId) || "Unknown" })),
      []
    ));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Vendor attachments
router.get("/:id/vendor-attachments", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const attachments = await db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id));
    const uploaderIds = attachments.map(a => a.uploadedBy);
    const uploaders = uploaderIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, uploaderIds))
      : [];
    const uploaderMap = new Map(uploaders.map(u => [u.id, u.name]));
    res.json(attachments.map(a => ({
      ...a,
      quotedPrice: a.quotedPrice ? parseFloat(a.quotedPrice) : null,
      uploaderName: uploaderMap.get(a.uploadedBy) || "Unknown",
    })));
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/:id/vendor-attachments", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { vendorName, fileUrl, quotedPrice, notes } = req.body;
  if (!vendorName || !fileUrl) { res.status(400).json({ error: "vendorName and fileUrl required" }); return; }
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    // Only requester or admin can upload vendor attachments on approved PR
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    if (!["approved"].includes(pr.status)) { res.status(400).json({ error: "PR must be approved to upload vendor attachments" }); return; }
    const [att] = await db.insert(prVendorAttachmentsTable).values({
      prId: id, vendorName, fileUrl, quotedPrice: quotedPrice?.toString() || null, notes, uploadedBy: user.id,
    }).returning();
    res.status(201).json({ ...att, quotedPrice: att.quotedPrice ? parseFloat(att.quotedPrice) : null, uploaderName: user.name });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/:id/vendor-attachments/:attachmentId", async (req, res) => {
  const user = req.user!;
  const prId = parseInt(req.params.id);
  const attId = parseInt(req.params.attachmentId);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, prId));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(prVendorAttachmentsTable).where(and(eq(prVendorAttachmentsTable.id, attId), eq(prVendorAttachmentsTable.prId, prId)));
    res.json({ success: true, message: "Attachment deleted" });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Select vendor (approver if PO off, purchasing if PO on)
router.post("/:id/select-vendor", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { vendorAttachmentId, finalQty, finalAmount } = req.body;
  if (!vendorAttachmentId || finalAmount === undefined) {
    res.status(400).json({ error: "vendorAttachmentId and finalAmount required" }); return;
  }
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "approved") { res.status(400).json({ error: "PR must be approved to select vendor" }); return; }

    // Check setting: if PO on → only purchasing, if PO off → approver can select
    // We'll allow both roles here and let the frontend gate it
    if (!["admin", "approver", "purchasing"].includes(user.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const [va] = await db.select().from(prVendorAttachmentsTable).where(and(eq(prVendorAttachmentsTable.id, vendorAttachmentId), eq(prVendorAttachmentsTable.prId, id)));
    if (!va) { res.status(404).json({ error: "Vendor attachment not found" }); return; }

    const [updated] = await db.update(purchaseRequestsTable).set({
      selectedVendorId: vendorAttachmentId,
      vendorSelectedBy: user.id,
      vendorSelectedAt: new Date(),
      vendorFinalQty: finalQty?.toString() || null,
      vendorFinalAmount: finalAmount.toString(),
      status: "vendor_selected",
      updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    await createNotification(pr.requesterId, "Vendor Dipilih",
      `Vendor untuk PR ${pr.prNumber} telah dipilih: ${va.vendorName}`, "info", id);
    await createAuditLog(user.id, "select_vendor", "pr", id, `Selected vendor: ${va.vendorName}`);

    const [items, approvals, vendorAttachments] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, id)),
      db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id)),
    ]);
    const approverIds = approvals.map(a => a.approverId);
    const uploaderIds = [...new Set(vendorAttachments.map((v: any) => v.uploadedBy))];
    const allIds = [...new Set([...approverIds, ...uploaderIds])];
    const allUsers = allIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, allIds))
      : [];
    const userMap = new Map(allUsers.map(u => [u.id, u.name]));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));

    res.json(await buildFullPR(
      { ...updated, requesterName: requester?.name || "Unknown" },
      items,
      approvals.map(a => ({ ...a, approverName: userMap.get(a.approverId) || "Unknown" })),
      vendorAttachments.map(v => ({ ...v, quotedPrice: v.quotedPrice ? parseFloat(v.quotedPrice) : null, uploaderName: userMap.get(v.uploadedBy) || "Unknown" }))
    ));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Receive (works for both PO-on and PO-off flows)
router.post("/:id/receive", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (!["approved", "vendor_selected"].includes(pr.status)) { res.status(400).json({ error: "PR not ready to receive" }); return; }
    if (pr.requesterId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }

    const [updated] = await db.update(purchaseRequestsTable).set({
      status: "completed", notes: notes || pr.notes, updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();
    await createAuditLog(user.id, "receive_pr", "pr", id);
    await createNotification(pr.requesterId, "PR Selesai", `PR ${pr.prNumber} telah diterima`, "info", id);

    const [items] = await Promise.all([db.select().from(prItemsTable).where(eq(prItemsTable.prId, id))]);
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(await buildFullPR({ ...updated, requesterName: requester?.name || "Unknown" }, items, [], []));
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Receiving list
router.get("/receiving-list", async (req, res) => {
  const user = req.user!;
  try {
    // POs ready for receiving (PO ON flow): issued POs where user is requester
    const prReadyPOs = await db
      .select({
        id: purchaseOrdersTable.id,
        prId: purchaseOrdersTable.prId,
        poNumber: purchaseOrdersTable.poNumber,
        supplier: purchaseOrdersTable.supplier,
        totalAmount: purchaseOrdersTable.totalAmount,
        status: purchaseOrdersTable.status,
      })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.status, "issued"));

    // PRs vendor_selected (PO OFF flow) where user is requester
    const conditions: any[] = [eq(purchaseRequestsTable.status, "vendor_selected")];
    if (user.role === "user") conditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    const vendorSelectedPRs = await db.select().from(purchaseRequestsTable).where(and(...conditions));

    // Get PR info for POs
    const poItems = [];
    for (const po of prReadyPOs) {
      const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, po.prId));
      if (!pr) continue;
      if (user.role === "user" && pr.requesterId !== user.id) continue;
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      const selectedVendor = pr.selectedVendorId
        ? await db.select({ vendorName: prVendorAttachmentsTable.vendorName }).from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.id, pr.selectedVendorId))
        : [];
      poItems.push({
        id: po.id,
        type: "po" as const,
        prId: pr.id,
        prNumber: pr.prNumber,
        prDescription: pr.description,
        requesterName: requester?.name || "Unknown",
        department: pr.department,
        vendorName: po.supplier || selectedVendor[0]?.vendorName || null,
        totalAmount: parseFloat(po.totalAmount),
        status: po.status,
        poId: po.id,
        poNumber: po.poNumber,
      });
    }

    // PR vendor_selected items
    const prItems = [];
    for (const pr of vendorSelectedPRs) {
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      const selectedVendor = pr.selectedVendorId
        ? await db.select({ vendorName: prVendorAttachmentsTable.vendorName }).from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.id, pr.selectedVendorId))
        : [];
      prItems.push({
        id: pr.id,
        type: "pr" as const,
        prId: pr.id,
        prNumber: pr.prNumber,
        prDescription: pr.description,
        requesterName: requester?.name || "Unknown",
        department: pr.department,
        vendorName: selectedVendor[0]?.vendorName || null,
        totalAmount: pr.vendorFinalAmount ? parseFloat(pr.vendorFinalAmount) : parseFloat(pr.totalAmount),
        status: pr.status,
        poId: null,
        poNumber: null,
      });
    }

    const items = [...poItems, ...prItems];
    res.json({ items, total: items.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
