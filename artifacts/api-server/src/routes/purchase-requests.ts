import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable, prItemsTable, approvalsTable, approvalRulesTable,
  approvalRuleLevelsTable, usersTable, companiesTable, prVendorAttachmentsTable,
  purchaseOrdersTable, prReceivingItemsTable, userLeaveBalancesTable, locationsTable
} from "@workspace/db/schema";
import { eq, desc, ilike, and, inArray, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { createNotification } from "../lib/notifications.js";
import { generatePRNumber } from "../lib/prNumber.js";
import { sendApprovalRequestEmail, sendVendorAttachmentRequestEmail, sendReceivingReadyEmail } from "../lib/email.js";

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

  // Load receiving records
  const receivingRecords = await db
    .select({
      id: prReceivingItemsTable.id,
      prId: prReceivingItemsTable.prId,
      prItemId: prReceivingItemsTable.prItemId,
      receivedQty: prReceivingItemsTable.receivedQty,
      receivedAt: prReceivingItemsTable.receivedAt,
      receivedBy: prReceivingItemsTable.receivedBy,
      receivedByName: usersTable.name,
      notes: prReceivingItemsTable.notes,
    })
    .from(prReceivingItemsTable)
    .leftJoin(usersTable, eq(prReceivingItemsTable.receivedBy, usersTable.id))
    .where(eq(prReceivingItemsTable.prId, pr.id));

  let fromLocationName: string | null = null;
  let toLocationName: string | null = null;
  if ((pr as any).fromLocationId) {
    const [loc] = await db.execute(sql`SELECT name FROM locations WHERE id=${(pr as any).fromLocationId}`).then((r: any) => r.rows || []);
    fromLocationName = loc?.name || null;
  }
  if ((pr as any).toLocationId) {
    const [loc] = await db.execute(sql`SELECT name FROM locations WHERE id=${(pr as any).toLocationId}`).then((r: any) => r.rows || []);
    toLocationName = loc?.name || null;
  }

  return {
    ...parsePRRow(pr),
    companyName,
    leaveRequesterName,
    selectedVendorName,
    vendorSelectedByName,
    fromLocationName,
    toLocationName,
    receivingStatus: pr.receivingStatus || "none",
    receivingRecords: receivingRecords.map(r => ({ ...r, receivedQty: parseFloat(r.receivedQty) })),
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
  const { type, description, items, notes, companyId, department, leaveStartDate, leaveEndDate, leaveRequesterId, fromLocationId, toLocationId } = req.body;
  if (!type || !description) { res.status(400).json({ error: "Bad Request", message: "Missing required fields" }); return; }
  if (type === "transfer" && (!fromLocationId || !toLocationId)) {
    res.status(400).json({ error: "Bad Request", message: "Lokasi asal dan tujuan wajib diisi untuk Transfer Barang" }); return;
  }
  if (type !== "leave" && (!items || !Array.isArray(items) || items.length === 0)) {
    res.status(400).json({ error: "Bad Request", message: "Items required for this request type" }); return;
  }

  // Leave balance validation
  if (type === "leave") {
    if (!leaveStartDate || !leaveEndDate) {
      res.status(400).json({ error: "Bad Request", message: "Tanggal cuti wajib diisi" }); return;
    }
    const start = new Date(leaveStartDate);
    const end = new Date(leaveEndDate);
    if (end < start) {
      res.status(400).json({ error: "Bad Request", message: "Tanggal akhir tidak boleh sebelum tanggal mulai" }); return;
    }
    const requestedDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const targetUserId = leaveRequesterId ? parseInt(leaveRequesterId) : user.id;
    const year = start.getFullYear();

    try {
      const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId));
      let [balance] = await db.select().from(userLeaveBalancesTable)
        .where(and(eq(userLeaveBalancesTable.userId, targetUserId), eq(userLeaveBalancesTable.year, year)));

      let availableDays = 0;
      if (balance) {
        availableDays = Math.max(0, parseFloat(balance.balanceDays) + parseFloat(balance.carriedOverDays) - parseFloat(balance.usedDays));
      }

      // Count already-pending/approved leave days for this user in the same year (to prevent double booking)
      const pendingResult = await db.execute(sql`
        SELECT COALESCE(SUM(
          EXTRACT(DAY FROM (leave_end_date::date - leave_start_date::date)) + 1
        ), 0) as pending_days
        FROM purchase_requests
        WHERE type = 'leave'
          AND leave_requester_id = ${targetUserId}
          AND status NOT IN ('rejected', 'closed', 'cancelled')
          AND leave_start_date IS NOT NULL
          AND EXTRACT(YEAR FROM leave_start_date::date) = ${year}
      `);
      const pendingDays = parseFloat((pendingResult.rows[0] as any)?.pending_days || "0");

      if (requestedDays > (availableDays - pendingDays)) {
        const remaining = Math.max(0, availableDays - pendingDays);
        res.status(400).json({
          error: "Saldo Cuti Tidak Cukup",
          message: `Sisa cuti: ${remaining} hari (termasuk ${pendingDays} hari dalam pengajuan pending). Permintaan: ${requestedDays} hari.`,
          availableDays, pendingDays, requestedDays, remaining,
        });
        return;
      }
    } catch (balanceErr) {
      console.error("Leave balance check failed:", balanceErr);
      // If balance check fails (no record), allow creation but log warning
    }
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
      fromLocationId: fromLocationId ? parseInt(fromLocationId) : null,
      toLocationId: toLocationId ? parseInt(toLocationId) : null,
    } as any).returning();

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
    const sortedLevels = [...allLevels].sort((a, b) => a.level - b.level);

    let applicableLevels: typeof sortedLevels;
    if (pr.type === "leave") {
      applicableLevels = sortedLevels;
    } else {
      // Find the "ceiling level" — the level whose min-max range contains the PR amount.
      // All levels from 1 up to and including this ceiling level must approve.
      const ceilingLevel = sortedLevels.find(l => {
        const min = l.minAmount ? parseFloat(l.minAmount) : 0;
        const max = l.maxAmount ? parseFloat(l.maxAmount) : Infinity;
        return amount >= min && amount <= max;
      });
      if (!ceilingLevel) {
        res.status(400).json({ error: "Bad Request", message: "Tidak ada approver yang sesuai dengan jumlah PR. Hubungi Admin." }); return;
      }
      // Include every level up to and including the ceiling level
      applicableLevels = sortedLevels.filter(l => l.level <= ceilingLevel.level);
    }

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

    const firstLevelApprovers = applicableLevels.filter(l => l.level === minLevel);
    for (const l of firstLevelApprovers) {
      await createNotification(l.approverId!, "PR Perlu Disetujui",
        `PR ${pr.prNumber} dari ${user.name} membutuhkan persetujuan Anda`, "approval_request", id);
      const [approverUser] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, l.approverId!));
      if (approverUser?.email) {
        sendApprovalRequestEmail(approverUser.email, approverUser.name, pr.prNumber, user.name, parseFloat(pr.totalAmount), pr.description).catch(() => {});
      }
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

// Cancel a draft PR (creator, approver assigned to PR, or admin)
router.post("/:id/cancel", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.status !== "draft") {
      res.status(400).json({ error: "Bad Request", message: "Hanya PR berstatus Draft yang dapat dibatalkan." }); return;
    }
    const isCreator = pr.requesterId === user.id;
    const isAdmin = user.role === "admin";
    // Approver in same department (or any approver if no dept restriction) can cancel drafts
    const isApproverSameDept = user.role === "approver" && pr.department === user.department;
    if (!isCreator && !isAdmin && !isApproverSameDept) {
      res.status(403).json({ error: "Forbidden", message: "Anda tidak memiliki izin untuk membatalkan PR ini." }); return;
    }
    const updatedNotes = notes
      ? (pr.notes ? `${pr.notes}\n[Dibatalkan] ${notes}` : `[Dibatalkan] ${notes}`)
      : pr.notes;
    const [updated] = await db.update(purchaseRequestsTable)
      .set({ status: "cancelled", notes: updatedNotes, updatedAt: new Date() })
      .where(eq(purchaseRequestsTable.id, id)).returning();
    await createAuditLog(user.id, "cancel_pr", "pr", id, `PR ${pr.prNumber} dibatalkan oleh ${user.name}`);
    const [items, approvals] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(approvalsTable).where(eq(approvalsTable.prId, id)),
    ]);
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(await buildFullPR({ ...updated, requesterName: requester?.name || user.name }, items, approvals, []));
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
      status: "completed", receivingStatus: "closed", notes: notes || pr.notes, updatedAt: new Date(),
    }).where(eq(purchaseRequestsTable.id, id)).returning();
    await createAuditLog(user.id, "receive_pr", "pr", id);
    await createNotification(pr.requesterId, "PR Selesai", `PR ${pr.prNumber} telah diterima`, "info", id);

    const items = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const vas = await db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id));
    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    res.json(await buildFullPR({ ...updated, requesterName: requester?.name || "Unknown" }, items, [], vas));
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// Partial receiving: submit received quantities per item
router.post("/:id/receive-items", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  const { items, notes } = req.body; // items: [{prItemId, receivedQty}]
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (!["approved", "vendor_selected", "completed"].includes(pr.status)) {
      res.status(400).json({ error: "PR belum siap untuk penerimaan barang" }); return;
    }
    if (pr.receivingStatus === "closed") {
      res.status(400).json({ error: "Penerimaan sudah ditutup" }); return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Items wajib diisi" }); return;
    }

    const now = new Date();
    await db.insert(prReceivingItemsTable).values(
      items.map((it: any) => ({
        prId: id,
        prItemId: parseInt(it.prItemId),
        receivedQty: String(it.receivedQty),
        receivedBy: user.id,
        receivedAt: now,
        notes: notes || null,
      }))
    );

    // Calculate total received vs target
    const prItems = await db.select().from(prItemsTable).where(eq(prItemsTable.prId, id));
    const allReceiving = await db.select().from(prReceivingItemsTable).where(eq(prReceivingItemsTable.prId, id));

    const totalByItem = new Map<number, number>();
    for (const r of allReceiving) {
      const curr = totalByItem.get(r.prItemId) || 0;
      totalByItem.set(r.prItemId, curr + parseFloat(r.receivedQty));
    }

    const allComplete = prItems.every(item => {
      const received = totalByItem.get(item.id) || 0;
      return received >= parseFloat(item.qty);
    });

    const newReceivingStatus = allComplete ? "closed" : "partial";
    const newStatus = (allComplete || pr.status === "completed") ? "completed" : pr.status;

    const [updated] = await db.update(purchaseRequestsTable).set({
      receivingStatus: newReceivingStatus,
      status: newStatus,
      updatedAt: now,
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    await createAuditLog(user.id, "receive_items", "pr", id);

    const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
    const vas = await db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id));
    res.json(await buildFullPR({ ...updated, requesterName: requester?.name || "Unknown" }, prItems, [], vas));
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Close receiving manually (even if not all qty received)
router.post("/:id/close-receiving", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    if (pr.receivingStatus === "none") {
      res.status(400).json({ error: "Belum ada penerimaan untuk ditutup" }); return;
    }
    if (pr.receivingStatus === "closed") {
      res.status(400).json({ error: "Penerimaan sudah ditutup" }); return;
    }
    if (pr.requesterId !== user.id && !["admin", "approver"].includes(user.role)) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    const closedAt = new Date();
    const [updated] = await db.update(purchaseRequestsTable).set({
      receivingStatus: "closed",
      receivingClosedAt: closedAt,
      status: "completed",
      updatedAt: closedAt,
    }).where(eq(purchaseRequestsTable.id, id)).returning();

    await createAuditLog(user.id, "close_receiving", "pr", id);
    await createNotification(pr.requesterId, "Penerimaan Ditutup", `Penerimaan barang PR ${pr.prNumber} telah ditutup`, "info", id);

    const [items, vas, requester] = await Promise.all([
      db.select().from(prItemsTable).where(eq(prItemsTable.prId, id)),
      db.select().from(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id)),
      db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId)),
    ]);
    res.json(await buildFullPR({ ...updated, requesterName: requester[0]?.name || "Unknown" }, items, [], vas));
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

    // Transfer PRs approved: ready for receiving
    const transferConditions: any[] = [
      eq(purchaseRequestsTable.type, "transfer"),
      eq(purchaseRequestsTable.status, "approved"),
    ];
    if (user.role === "user") transferConditions.push(eq(purchaseRequestsTable.requesterId, user.id));
    const transferPRs = await db.select().from(purchaseRequestsTable).where(and(...transferConditions));

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

    // Transfer PR items
    const transferItems = [];
    for (const pr of transferPRs) {
      if (pr.receivingStatus === "closed") continue;
      const [requester] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, pr.requesterId));
      let fromLocationName: string | null = null;
      let toLocationName: string | null = null;
      if ((pr as any).fromLocationId) {
        const [loc] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, (pr as any).fromLocationId));
        fromLocationName = loc?.name || null;
      }
      if ((pr as any).toLocationId) {
        const [loc] = await db.select({ name: locationsTable.name }).from(locationsTable).where(eq(locationsTable.id, (pr as any).toLocationId));
        toLocationName = loc?.name || null;
      }
      transferItems.push({
        id: pr.id,
        type: "transfer" as const,
        prId: pr.id,
        prNumber: pr.prNumber,
        prDescription: pr.description,
        requesterName: requester?.name || "Unknown",
        department: pr.department,
        vendorName: null,
        fromLocationId: (pr as any).fromLocationId,
        toLocationId: (pr as any).toLocationId,
        fromLocationName,
        toLocationName,
        totalAmount: parseFloat(pr.totalAmount),
        status: pr.status,
        poId: null,
        poNumber: null,
        receivingStatus: pr.receivingStatus,
      });
    }

    const items = [...poItems, ...prItems, ...transferItems];
    res.json({ items, total: items.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [pr] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!pr) { res.status(404).json({ error: "Not Found" }); return; }
    // Delete all related records first
    await db.delete(prReceivingItemsTable).where(eq(prReceivingItemsTable.prId, id));
    await db.delete(prVendorAttachmentsTable).where(eq(prVendorAttachmentsTable.prId, id));
    await db.delete(approvalsTable).where(eq(approvalsTable.prId, id));
    await db.delete(prItemsTable).where(eq(prItemsTable.prId, id));
    // Delete linked POs
    const linkedPOs = await db.select({ id: purchaseOrdersTable.id }).from(purchaseOrdersTable).where(eq(purchaseOrdersTable.prId, id));
    for (const po of linkedPOs) {
      await db.delete(prReceivingItemsTable).where(eq(prReceivingItemsTable.poId, po.id));
      await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, po.id));
    }
    await db.delete(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    await createAuditLog(user.id, "delete_pr", "pr", id, `Deleted PR ${pr.prNumber}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
