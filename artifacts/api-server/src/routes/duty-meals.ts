import { Router } from "express";
import { db } from "@workspace/db";
import { dutyMealsTable, dutyMealPlafonTable, brandsTable, usersTable, dutyMealMonthlyPaymentsTable, dutyMealCompanyApproversTable, companiesTable } from "@workspace/db/schema";
import { eq, and, sql, inArray, or, lt, ne } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { sendDutyMealOverAmountEmail } from "../lib/email.js";
import { google } from "googleapis";
import { Readable } from "stream";

const router = Router();
router.use(requireAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string> {
  const rows = await db.execute(sql`SELECT value FROM settings WHERE key = ${key}`);
  const row = (rows as any).rows?.[0];
  return row?.value ?? "";
}

async function isMonthLocked(mealMonth: string): Promise<boolean> {
  const lockDateStr = await getSetting("duty_meal_lock_date");
  if (!lockDateStr) return false;
  const lockDate = parseInt(lockDateStr);
  if (isNaN(lockDate)) return false;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (mealMonth >= currentMonth) return false;
  return now.getDate() > lockDate;
}

/** Returns array of companyIds the user is a duty meal approver for */
async function getApproverCompanyIds(userId: number): Promise<number[]> {
  const rows = await db.select({ companyId: dutyMealCompanyApproversTable.companyId })
    .from(dutyMealCompanyApproversTable)
    .where(eq(dutyMealCompanyApproversTable.userId, userId));
  return rows.map(r => r.companyId);
}

/** Returns true if user is admin OR is a duty meal approver for any company */
async function isUserDutyMealApprover(user: any): Promise<boolean> {
  if (user.role === "admin") return true;
  const ids = await getApproverCompanyIds(user.id);
  return ids.length > 0;
}

/** Returns true if user can approve entries for a specific companyId */
async function canApproveForCompany(user: any, companyId: number | null | undefined): Promise<boolean> {
  if (user.role === "admin") return true;
  if (!companyId) return false;
  const ids = await getApproverCompanyIds(user.id);
  return ids.includes(companyId);
}

async function getUserPlafon(companyId: number, position: string): Promise<number> {
  const plafons = await db.select().from(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.companyId, companyId));
  if (plafons.length === 0) return 500000;
  const exact = plafons.find(p => p.positionName.toLowerCase() === position.toLowerCase());
  if (exact) return Number(exact.amount);
  const lp = position.toLowerCase();
  if (lp.includes("general manager")) {
    const gm = plafons.find(p => p.positionName.toLowerCase().includes("general manager"));
    if (gm) return Number(gm.amount);
  }
  if (lp.includes("assistant manager") || lp.includes("asst") || lp.includes("ass. manager")) {
    const am = plafons.find(p => p.positionName.toLowerCase().includes("assistant"));
    if (am) return Number(am.amount);
  }
  if (lp.includes("manager")) {
    const m = plafons.find(p => p.positionName.toLowerCase() === "manager");
    if (m) return Number(m.amount);
  }
  const staff = plafons.find(p => p.positionName.toLowerCase().includes("staff"));
  if (staff) return Number(staff.amount);
  const sorted = [...plafons].sort((a, b) => Number(a.amount) - Number(b.amount));
  return Number(sorted[0].amount);
}

interface GDriveUploadMeta {
  mealDate?: string;         // "YYYY-MM-DD" — used in filename and folder
  folderYearMonth?: string;  // "YYYY-MM" — override folder path (used for monthly payment)
  filePrefix?: string;       // prepend prefix e.g. "Pembayaran"
  brandName?: string;
  username?: string;
  fullName?: string;
  originalFilename?: string; // to extract extension
}

function sanitizeForFilename(str: string): string {
  return (str || "").replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function getOrCreateFolder(drive: any, name: string, parentId: string): Promise<string> {
  const safeQ = name.replace(/'/g, "\\'");
  const q = `name='${safeQ}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({ q, supportsAllDrives: true, includeItemsFromAllDrives: true, fields: "files(id)", pageSize: 1 });
  if (list.data.files && list.data.files.length > 0) return list.data.files[0].id;
  const created = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
  });
  return created.data.id!;
}

async function uploadToGDrive(base64Data: string, originalFilename: string, meta?: GDriveUploadMeta): Promise<{ fileId: string; fileUrl: string; error?: string } | null> {
  try {
    const [rootFolder, email, rawKey] = await Promise.all([
      getSetting("duty_meal_gdrive_folder"),
      getSetting("duty_meal_gdrive_email"),
      getSetting("duty_meal_gdrive_private_key"),
    ]);
    if (!rootFolder || !email || !rawKey) return null;

    const privateKey = rawKey.replace(/\\n/g, "\n");
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });

    // ── Build filename ──────────────────────────────────────────
    const ext = (meta?.originalFilename || originalFilename).split(".").pop()?.toLowerCase() || "jpg";
    let finalName: string;
    if (meta?.mealDate) {
      const parts = [
        ...(meta.filePrefix ? [meta.filePrefix] : []),
        meta.mealDate,
        sanitizeForFilename(meta.brandName || ""),
        sanitizeForFilename(meta.username || ""),
        sanitizeForFilename(meta.fullName || ""),
      ].filter(Boolean);
      finalName = parts.join("-") + "." + ext;
    } else {
      finalName = originalFilename;
    }

    // ── Build folder hierarchy: rootFolder / YYYY / YYYY-MM ─────
    // folderYearMonth overrides mealDate for folder path (e.g. monthly payment)
    const folderYM = meta?.folderYearMonth || (meta?.mealDate ? meta.mealDate.substring(0, 7) : null);
    let targetFolder = rootFolder;
    if (folderYM) {
      const year = folderYM.substring(0, 4);
      const yearFolder = await getOrCreateFolder(drive, year, rootFolder);
      targetFolder = await getOrCreateFolder(drive, folderYM, yearFolder);
    }

    // ── Upload file ─────────────────────────────────────────────
    const base64Content = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
    const mimeType = base64Data.startsWith("data:") ? base64Data.split(";")[0].split(":")[1] : "application/octet-stream";
    const buffer = Buffer.from(base64Content, "base64");
    const stream = Readable.from(buffer);

    const res = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: finalName, parents: [targetFolder] },
      media: { mimeType, body: stream },
      fields: "id,webViewLink",
    });

    try {
      await drive.permissions.create({
        fileId: res.data.id!,
        supportsAllDrives: true,
        requestBody: { role: "reader", type: "anyone" },
      });
    } catch { /* Shared Drive may restrict public links — ignore */ }

    return { fileId: res.data.id!, fileUrl: res.data.webViewLink! };
  } catch (err: any) {
    const cause = err?.cause || err;
    const msg: string = cause?.message || err?.message || "Unknown error";
    let friendlyMsg = msg;
    if (msg.includes("has not been used") || msg.includes("is disabled")) {
      friendlyMsg = "Google Drive API belum diaktifkan di Google Cloud Console.";
    } else if (msg.includes("invalid_grant") || msg.includes("Invalid JWT")) {
      friendlyMsg = "Private key service account tidak valid atau expired.";
    } else if (msg.includes("storage quota") || msg.includes("storageQuota")) {
      friendlyMsg = "Service account tidak bisa upload ke My Drive. Gunakan Shared Drive dan tambah service account sebagai Member.";
    } else if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      friendlyMsg = "Akses ditolak. Pastikan service account punya akses Editor ke folder/Shared Drive.";
    } else if (msg.includes("404") || msg.includes("notFound")) {
      friendlyMsg = "Folder ID tidak ditemukan atau service account tidak punya akses ke folder tersebut.";
    }
    console.error("[GDrive upload error]", friendlyMsg, "|", msg);
    return { fileId: "", fileUrl: "", error: friendlyMsg };
  }
}

// ─── PLAFON ENDPOINTS ──────────────────────────────────────────────────────

router.get("/plafon", async (req, res) => {
  try {
    const { companyId } = req.query;
    const rows = companyId
      ? await db.select().from(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.companyId, Number(companyId)))
      : await db.select().from(dutyMealPlafonTable);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.post("/plafon", requireRole("admin"), async (req, res) => {
  try {
    const { companyId, positionName, amount } = req.body;
    if (!companyId || !positionName || amount === undefined) { res.status(400).json({ error: "Required fields missing" }); return; }
    const [row] = await db.insert(dutyMealPlafonTable).values({
      companyId: Number(companyId), positionName: positionName.trim(), amount: String(amount),
    }).returning();
    res.json(row);
  } catch (err: any) {
    if (err.code === "23505") { res.status(400).json({ error: "Plafon sudah ada untuk perusahaan & jabatan ini" }); return; }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/plafon/:id", requireRole("admin"), async (req, res) => {
  try {
    const { positionName, amount, companyId } = req.body;
    const updates: any = {};
    if (positionName !== undefined) updates.positionName = positionName.trim();
    if (amount !== undefined) updates.amount = String(amount);
    if (companyId !== undefined) updates.companyId = Number(companyId);
    const [row] = await db.update(dutyMealPlafonTable).set(updates).where(eq(dutyMealPlafonTable.id, Number(req.params.id))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/plafon/:id", requireRole("admin"), async (req, res) => {
  try {
    await db.delete(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── MY PLAFON ────────────────────────────────────────────────────────────

router.get("/my-plafon", async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.hiredCompanyId) { res.json({ amount: 0 }); return; }
    const amount = await getUserPlafon(user.hiredCompanyId, user.position);
    res.json({ amount, position: user.position });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── MONTHLY PAYMENTS ─────────────────────────────────────────────────────

// GET /api/duty-meals/monthly-payments?month=
router.get("/monthly-payments", async (req, res) => {
  try {
    const user = req.user as any;
    const isAdmin = user.role === "admin";
    const approverCompanyIds = await getApproverCompanyIds(user.id);
    const isApprover = isAdmin || approverCompanyIds.length > 0;
    const { month } = req.query;

    const filters: any[] = [];
    if (month) filters.push(eq(dutyMealMonthlyPaymentsTable.mealMonth, String(month)));

    let rows: any[];
    if (isAdmin) {
      rows = filters.length
        ? await db.select().from(dutyMealMonthlyPaymentsTable).where(and(...filters))
        : await db.select().from(dutyMealMonthlyPaymentsTable);
    } else if (approverCompanyIds.length > 0) {
      // Approver sees payments from users in their assigned companies
      const approvedUsers = await db.select({ id: usersTable.id })
        .from(usersTable).where(inArray(usersTable.hiredCompanyId, approverCompanyIds));
      const approvedUserIds = approvedUsers.map(u => u.id);
      const companyFilter = approvedUserIds.length > 0
        ? inArray(dutyMealMonthlyPaymentsTable.userId, approvedUserIds)
        : eq(dutyMealMonthlyPaymentsTable.userId, -1);
      rows = await db.select().from(dutyMealMonthlyPaymentsTable)
        .where(filters.length ? and(companyFilter, ...filters) : companyFilter);
    } else {
      filters.push(eq(dutyMealMonthlyPaymentsTable.userId, user.id));
      rows = await db.select().from(dutyMealMonthlyPaymentsTable)
        .where(and(...filters));
    }

    // Enrich with user name
    const userIds = [...new Set(rows.map(r => r.userId))];
    const usersRows = userIds.length
      ? await db.select({ id: usersTable.id, name: usersTable.name, position: usersTable.position })
          .from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(usersRows.map(u => [u.id, u]));
    const enriched = rows.map(r => ({ ...r, userName: (userMap.get(r.userId) as any)?.name || "Unknown" }));
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/duty-meals/monthly-payment/:month/upload
router.post("/monthly-payment/:month/upload", async (req, res) => {
  try {
    const user = req.user as any;
    const mealMonth = req.params.month;

    // Check if month is locked
    if (await isMonthLocked(mealMonth)) {
      res.status(400).json({ error: "Periode ini sudah terkunci. Tidak bisa upload bukti pembayaran." });
      return;
    }

    const { fileData, filename } = req.body;
    if (!fileData) { res.status(400).json({ error: "fileData required" }); return; }

    // Look up brand name from user's meal entries this month
    const userMeals = await db.select({ brandId: dutyMealsTable.brandId })
      .from(dutyMealsTable)
      .where(and(eq(dutyMealsTable.userId, user.id), eq(dutyMealsTable.mealMonth, mealMonth)));
    const brandIdCounts = new Map<number, number>();
    for (const m of userMeals) {
      if (m.brandId) brandIdCounts.set(m.brandId, (brandIdCounts.get(m.brandId) || 0) + 1);
    }
    let brandNameForFile = "";
    if (brandIdCounts.size > 0) {
      const topBrandId = [...brandIdCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const [br] = await db.select({ name: brandsTable.name }).from(brandsTable).where(eq(brandsTable.id, topBrandId));
      brandNameForFile = br?.name || "";
    }

    // Today's date for filename, mealMonth for folder
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Upload to GDrive if configured
    const gdrive = await uploadToGDrive(fileData, filename || "bukti_pembayaran.jpg", {
      filePrefix: "Pembayaran",
      mealDate: today,
      folderYearMonth: mealMonth,
      brandName: brandNameForFile,
      username: user.username,
      fullName: user.name || user.username,
      originalFilename: filename || "bukti_pembayaran.jpg",
    });
    const gdriveOk = gdrive && !gdrive.error && !!gdrive.fileId;

    // Get current month total to calculate over amount (exclude rejected)
    const meals = await db.select().from(dutyMealsTable)
      .where(and(eq(dutyMealsTable.userId, user.id), eq(dutyMealsTable.mealMonth, mealMonth)));
    const monthTotal = meals.filter(m => m.status !== "rejected").reduce((s, m) => s + Number(m.totalBillBeforeTax), 0);
    const plafon = user.hiredCompanyId ? await getUserPlafon(user.hiredCompanyId, user.position) : 0;
    const overAmount = Math.max(0, monthTotal - plafon);

    // Upsert monthly payment record
    const existing = await db.select({ id: dutyMealMonthlyPaymentsTable.id })
      .from(dutyMealMonthlyPaymentsTable)
      .where(and(eq(dutyMealMonthlyPaymentsTable.userId, user.id), eq(dutyMealMonthlyPaymentsTable.mealMonth, mealMonth)));

    let record: any;
    const data: any = {
      proofData: gdriveOk ? null : fileData,
      proofFilename: filename || "bukti_pembayaran.jpg",
      gdriveFileId: gdriveOk ? gdrive!.fileId : null,
      gdriveFileUrl: gdriveOk ? gdrive!.fileUrl : null,
      overAmount: String(overAmount),
      status: "pending",
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      [record] = await db.update(dutyMealMonthlyPaymentsTable).set(data)
        .where(eq(dutyMealMonthlyPaymentsTable.id, existing[0].id)).returning();
    } else {
      [record] = await db.insert(dutyMealMonthlyPaymentsTable).values({
        userId: user.id,
        companyId: user.hiredCompanyId || null,
        mealMonth,
        ...data,
      }).returning();
    }

    await createAuditLog(user.id, "UPLOAD_PAYMENT", "duty_meal_monthly_payment", record.id,
      `Bukti pembayaran bulan ${mealMonth} diupload${gdriveOk ? " ke Google Drive" : ""}${gdrive?.error ? ` | GDrive error: ${gdrive.error}` : ""}`);

    res.json({
      success: true,
      record,
      uploadedToGdrive: gdriveOk,
      gdriveUrl: gdriveOk ? gdrive!.fileUrl : null,
      gdriveWarning: gdrive?.error || null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/monthly-payment/:id/approve (Duty Meal Approver / Admin)
router.put("/monthly-payment/:id/approve", async (req, res) => {
  try {
    const user = req.user as any;
    const [payment] = await db.select().from(dutyMealMonthlyPaymentsTable).where(eq(dutyMealMonthlyPaymentsTable.id, Number(req.params.id)));
    if (!payment) { res.status(404).json({ error: "Not found" }); return; }
    if (!await canApproveForCompany(user, payment.companyId)) {
      res.status(403).json({ error: "Anda tidak memiliki akses untuk approve pembayaran PT ini" }); return;
    }
    const [updated] = await db.update(dutyMealMonthlyPaymentsTable)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(dutyMealMonthlyPaymentsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "APPROVE", "duty_meal_monthly_payment", Number(req.params.id), `Pembayaran bulanan disetujui oleh ${user.username}`);

    // Send email notification to user if overAmount > 0
    const overAmt = Number(updated.overAmount || 0);
    if (overAmt > 0) {
      const [userRecord] = await db.select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, payment.userId));
      if (userRecord?.email) {
        sendDutyMealOverAmountEmail(userRecord.email, userRecord.name || "", payment.mealMonth!, overAmt, "approved")
          .catch(e => console.error("[Email] duty meal over amount:", e));
      }
    }

    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/monthly-payment/:id/reject (Duty Meal Approver / Admin)
router.put("/monthly-payment/:id/reject", async (req, res) => {
  try {
    const user = req.user as any;
    const [payment] = await db.select().from(dutyMealMonthlyPaymentsTable).where(eq(dutyMealMonthlyPaymentsTable.id, Number(req.params.id)));
    if (!payment) { res.status(404).json({ error: "Not found" }); return; }
    if (!await canApproveForCompany(user, payment.companyId)) {
      res.status(403).json({ error: "Anda tidak memiliki akses untuk reject pembayaran PT ini" }); return;
    }
    const { reason } = req.body;
    const [updated] = await db.update(dutyMealMonthlyPaymentsTable)
      .set({ status: "rejected", rejectionReason: reason || null, updatedAt: new Date() })
      .where(eq(dutyMealMonthlyPaymentsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "REJECT", "duty_meal_monthly_payment", Number(req.params.id), `Pembayaran bulanan ditolak: ${reason || "-"}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── DUTY MEAL ENTRIES ─────────────────────────────────────────────────────

// GET /api/duty-meals?month=YYYY-MM
router.get("/", async (req, res) => {
  try {
    const user = req.user as any;
    const { month, userId } = req.query;
    const isAdmin = user.role === "admin";
    const approverCompanyIds = await getApproverCompanyIds(user.id);
    const isApprover = isAdmin || approverCompanyIds.length > 0;

    const filters: any[] = [];
    if (month) filters.push(eq(dutyMealsTable.mealMonth, String(month)));

    let meals: any[];
    if (isAdmin) {
      if (userId) filters.push(eq(dutyMealsTable.userId, Number(userId)));
      meals = filters.length
        ? await db.select().from(dutyMealsTable).where(and(...filters))
        : await db.select().from(dutyMealsTable);
    } else if (approverCompanyIds.length > 0) {
      // Approver sees entries of users in their assigned companies
      const approvedUsers = await db.select({ id: usersTable.id })
        .from(usersTable).where(inArray(usersTable.hiredCompanyId, approverCompanyIds));
      const approvedUserIds = approvedUsers.map(u => u.id);
      // If specific userId requested
      if (userId) {
        const reqUid = Number(userId);
        // Always allow approver to view their own entries
        if (reqUid === user.id || approvedUserIds.includes(reqUid)) {
          filters.push(eq(dutyMealsTable.userId, reqUid));
        } else {
          return res.json([]); // not in approver's scope
        }
      } else {
        filters.push(approvedUserIds.length > 0
          ? inArray(dutyMealsTable.userId, approvedUserIds)
          : eq(dutyMealsTable.userId, -1));
      }
      meals = filters.length
        ? await db.select().from(dutyMealsTable).where(and(...filters))
        : await db.select().from(dutyMealsTable);
    } else {
      filters.push(eq(dutyMealsTable.userId, user.id));
      meals = await db.select().from(dutyMealsTable).where(and(...filters));
    }

    const userIds = [...new Set(meals.map(m => m.userId))];
    const brandIds = [...new Set(meals.map(m => m.brandId).filter(Boolean))];

    const [usersRows, brandsRows] = await Promise.all([
      userIds.length
        ? db.select({ id: usersTable.id, name: usersTable.name, position: usersTable.position, department: usersTable.department, hiredCompanyId: usersTable.hiredCompanyId })
            .from(usersTable).where(inArray(usersTable.id, userIds))
        : [],
      brandIds.length ? db.select().from(brandsTable).where(inArray(brandsTable.id, brandIds as number[])) : [],
    ]);

    const userMap = new Map((usersRows as any[]).map((u: any) => [u.id, u]));
    const brandMap = new Map((brandsRows as any[]).map((b: any) => [b.id, b]));

    const plafonMap = new Map<number, number>();
    for (const uid of userIds) {
      const u = userMap.get(uid) as any;
      if (u?.hiredCompanyId) {
        const p = await getUserPlafon(u.hiredCompanyId, u.position);
        plafonMap.set(uid, p);
      }
    }

    const monthlyTotals = new Map<string, number>();
    for (const m of meals) {
      if (m.status === "rejected") continue; // exclude rejected from total
      const key = `${m.userId}:${m.mealMonth}`;
      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + Number(m.totalBillBeforeTax));
    }

    const enriched = meals.map(m => {
      const u = userMap.get(m.userId) as any;
      const brand = m.brandId ? brandMap.get(m.brandId) : null;
      const plafon = plafonMap.get(m.userId) || 0;
      const monthTotal = monthlyTotals.get(`${m.userId}:${m.mealMonth}`) || 0;
      return {
        ...m,
        userName: u?.name || "Unknown",
        userPosition: u?.position || "",
        userDepartment: u?.department || "",
        brandName: (brand as any)?.name || null,
        plafon,
        monthTotal,
        isOverPlafon: monthTotal > plafon && plafon > 0,
        overAmount: Math.max(0, monthTotal - plafon),
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/duty-meals
router.post("/", async (req, res) => {
  try {
    const user = req.user as any;
    const enabled = await getSetting("duty_meal_enabled");
    if (enabled !== "true") { res.status(403).json({ error: "Fitur Duty Meal tidak aktif" }); return; }

    // Check duty meal eligibility based on joinDate + minimum months setting
    const joinDate: string | null = (user as any).joinDate ?? null;
    if (joinDate) {
      const minMonthsStr = await getSetting("duty_meal_min_months");
      const minMonths = minMonthsStr ? parseInt(minMonthsStr) : 3;
      const jd = new Date(joinDate);
      const eligDate = new Date(jd.getFullYear(), jd.getMonth() + minMonths, jd.getDate());
      if (new Date() < eligDate) {
        const eligible = eligDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        res.status(403).json({
          error: `Duty Meal baru bisa diajukan setelah ${minMonths} bulan bekerja. Eligible mulai ${eligible}.`,
          eligibleDate: eligDate.toISOString().split("T")[0],
        });
        return;
      }
    }

    // Check unpaid overAmount lock/warn setting
    const unpaidLockMode = await getSetting("duty_meal_unpaid_lock"); // "lock" | "warn" | ""
    if (unpaidLockMode === "lock" || unpaidLockMode === "warn") {
      const maxUnpaidStr = await getSetting("duty_meal_unpaid_months");
      const maxUnpaid = parseInt(maxUnpaidStr || "2");
      const now2 = new Date();
      const curMonth = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}`;
      const allPayments = await db.select().from(dutyMealMonthlyPaymentsTable)
        .where(eq(dutyMealMonthlyPaymentsTable.userId, user.id));
      const approvedSet = new Set(allPayments.filter(p => p.status === "approved").map(p => p.mealMonth));
      const pastEntries = await db.select().from(dutyMealsTable)
        .where(and(eq(dutyMealsTable.userId, user.id), lt(dutyMealsTable.mealMonth, curMonth)));
      const pastTotals = new Map<string, number>();
      for (const e of pastEntries) {
        if (e.status === "rejected") continue;
        pastTotals.set(e.mealMonth!, (pastTotals.get(e.mealMonth!) || 0) + Number(e.totalBillBeforeTax));
      }
      const plafon2 = user.hiredCompanyId ? await getUserPlafon(user.hiredCompanyId, user.position) : 0;
      let unpaidCount = 0;
      for (const [m, total] of pastTotals) {
        if (total > plafon2 && !approvedSet.has(m)) unpaidCount++;
      }
      if (unpaidCount >= maxUnpaid) {
        if (unpaidLockMode === "lock") {
          res.status(403).json({
            error: `Anda memiliki kelebihan duty meal yang belum dibayar selama ${unpaidCount} bulan. Harap selesaikan pembayaran terlebih dahulu.`,
            unpaidCount, locked: true,
          });
          return;
        }
        // "warn" mode: return warning flag but still allow in response (frontend handles warn)
        // The frontend should show warning dialog. If user confirms, they pass `forceAdd: true`
        if (!req.body.forceAdd) {
          res.status(202).json({
            warning: true,
            message: `Anda memiliki kelebihan duty meal yang belum dibayar selama ${unpaidCount} bulan. Apakah Anda tetap ingin menambah entry baru?`,
            unpaidCount,
          });
          return;
        }
      }
    }

    const { brandId, mealDate, totalBillBeforeTax, description, receiptData, receiptFilename } = req.body;
    if (!mealDate || totalBillBeforeTax === undefined) { res.status(400).json({ error: "mealDate dan totalBillBeforeTax wajib diisi" }); return; }

    const mealMonth = mealDate.substring(0, 7);
    if (await isMonthLocked(mealMonth)) {
      res.status(400).json({ error: "Periode bulan tersebut sudah terkunci." });
      return;
    }

    // Lookup brand name for filename
    let brandName = "";
    if (brandId) {
      const [brand] = await db.select({ name: brandsTable.name }).from(brandsTable).where(eq(brandsTable.id, Number(brandId)));
      brandName = brand?.name || "";
    }

    // Upload receipt to GDrive if provided
    let receiptGdriveId: string | null = null;
    let receiptGdriveUrl: string | null = null;
    let storedReceiptData: string | null = null;
    let gdriveWarning: string | null = null;
    if (receiptData) {
      const gdrive = await uploadToGDrive(receiptData, receiptFilename || "struk.jpg", {
        mealDate,
        brandName,
        username: user.username,
        fullName: user.name || user.username,
        originalFilename: receiptFilename || "struk.jpg",
      });
      if (gdrive && !gdrive.error && gdrive.fileId) {
        receiptGdriveId = gdrive.fileId;
        receiptGdriveUrl = gdrive.fileUrl;
      } else {
        storedReceiptData = receiptData;
        if (gdrive?.error) gdriveWarning = gdrive.error;
      }
    }

    const [meal] = await db.insert(dutyMealsTable).values({
      userId: user.id,
      companyId: user.hiredCompanyId || null,
      brandId: brandId ? Number(brandId) : null,
      mealMonth,
      mealDate,
      totalBillBeforeTax: String(totalBillBeforeTax),
      description: description || null,
      status: "pending",
      receiptData: storedReceiptData,
      receiptFilename: receiptFilename || null,
      gdriveFileId: receiptGdriveId,
      gdriveFileUrl: receiptGdriveUrl,
    } as any).returning();

    await createAuditLog(user.id, "CREATE", "duty_meal", meal.id,
      `Duty meal entry dibuat: ${mealDate}, Rp${Number(totalBillBeforeTax).toLocaleString("id-ID")}${gdriveWarning ? ` | GDrive warning: ${gdriveWarning}` : ""}`);

    res.json({ ...meal, receiptGdriveUrl, gdriveWarning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── COMPANY APPROVERS CRUD (must be before /:id) ──────────────────────────

// GET /api/duty-meals/company-approvers
router.get("/company-approvers", requireRole("admin"), async (_req, res) => {
  try {
    const rows = await db.select({
      id: dutyMealCompanyApproversTable.id,
      companyId: dutyMealCompanyApproversTable.companyId,
      userId: dutyMealCompanyApproversTable.userId,
      companyName: companiesTable.name,
      userName: usersTable.name,
      userUsername: usersTable.username,
    })
    .from(dutyMealCompanyApproversTable)
    .leftJoin(companiesTable, eq(dutyMealCompanyApproversTable.companyId, companiesTable.id))
    .leftJoin(usersTable, eq(dutyMealCompanyApproversTable.userId, usersTable.id));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/duty-meals/company-approvers
router.post("/company-approvers", requireRole("admin"), async (req, res) => {
  try {
    const { companyId, userId } = req.body;
    if (!companyId || !userId) { res.status(400).json({ error: "companyId dan userId diperlukan" }); return; }
    const [existing] = await db.select().from(dutyMealCompanyApproversTable)
      .where(and(eq(dutyMealCompanyApproversTable.companyId, companyId), eq(dutyMealCompanyApproversTable.userId, userId)));
    if (existing) { res.status(409).json({ error: "User sudah menjadi approver untuk PT ini" }); return; }
    const [created] = await db.insert(dutyMealCompanyApproversTable)
      .values({ companyId: Number(companyId), userId: Number(userId) }).returning();
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/duty-meals/company-approvers/:id
router.delete("/company-approvers/:id", requireRole("admin"), async (req, res) => {
  try {
    await db.delete(dutyMealCompanyApproversTable).where(eq(dutyMealCompanyApproversTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── CARRY-OVER (unpaid overAmount from previous months) ────────────────────
// GET /api/duty-meals/carry-over — returns user's months with unpaid over-amount
router.get("/carry-over", async (req, res) => {
  try {
    const user = req.user as any;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // All payments for this user
    const payments = await db.select().from(dutyMealMonthlyPaymentsTable)
      .where(eq(dutyMealMonthlyPaymentsTable.userId, user.id));
    const approvedMonths = new Set(payments.filter(p => p.status === "approved").map(p => p.mealMonth));
    const paymentByMonth = new Map(payments.map(p => [p.mealMonth, p]));

    // All entries for months BEFORE current month (non-rejected)
    const entries = await db.select().from(dutyMealsTable)
      .where(and(eq(dutyMealsTable.userId, user.id), lt(dutyMealsTable.mealMonth, currentMonth)));

    const monthTotals = new Map<string, number>();
    for (const m of entries) {
      if (m.status === "rejected") continue;
      monthTotals.set(m.mealMonth!, (monthTotals.get(m.mealMonth!) || 0) + Number(m.totalBillBeforeTax));
    }

    const plafon = user.hiredCompanyId ? await getUserPlafon(user.hiredCompanyId, user.position) : 0;
    const unpaidMonths: any[] = [];
    for (const [month, total] of monthTotals) {
      const over = Math.max(0, total - plafon);
      if (over > 0 && !approvedMonths.has(month)) {
        unpaidMonths.push({ month, total, plafon, overAmount: over, paymentStatus: paymentByMonth.get(month)?.status || null });
      }
    }
    unpaidMonths.sort((a, b) => a.month.localeCompare(b.month));
    const totalCarryOver = unpaidMonths.reduce((s, m) => s + m.overAmount, 0);
    res.json({ unpaidMonths, totalCarryOver, unpaidCount: unpaidMonths.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── MONTHLY REPORT ──────────────────────────────────────────────────────────
// GET /api/duty-meals/monthly-report?month=YYYY-MM&companyId=  (admin / approver only)
router.get("/monthly-report", async (req, res) => {
  try {
    const user = req.user as any;
    const isAdmin = user.role === "admin";
    const approverCompanyIds = await getApproverCompanyIds(user.id);
    if (!isAdmin && approverCompanyIds.length === 0) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { month, companyId } = req.query;
    if (!month) { res.status(400).json({ error: "month query required" }); return; }

    // Determine which companyIds to scope to
    let scopeCompanyIds: number[] | null = null;  // null = all
    if (isAdmin) {
      if (companyId) scopeCompanyIds = [Number(companyId)];
    } else {
      // Approver: intersect with their approved companies
      scopeCompanyIds = companyId
        ? approverCompanyIds.filter(id => id === Number(companyId))
        : approverCompanyIds;
    }

    // Get users in scope
    let scopedUserIds: number[] | null = null;
    if (scopeCompanyIds !== null) {
      const scopedUsers = scopeCompanyIds.length
        ? await db.select({ id: usersTable.id }).from(usersTable)
            .where(inArray(usersTable.hiredCompanyId, scopeCompanyIds))
        : [];
      scopedUserIds = scopedUsers.map(u => u.id);
      if (scopedUserIds.length === 0) {
        return res.json({ rows: [], summary: { totalPemakaian: 0, totalOverAmount: 0, totalLunas: 0, totalBelumLunas: 0 } });
      }
    }

    // Get entries for this month
    const entryConditions: any[] = [eq(dutyMealsTable.mealMonth, String(month))];
    if (scopedUserIds !== null) entryConditions.push(inArray(dutyMealsTable.userId, scopedUserIds));
    const entries = await db.select().from(dutyMealsTable).where(and(...entryConditions));

    const userIds = [...new Set(entries.map(e => e.userId))];

    const [usersData, payments, allCompanies] = await Promise.all([
      userIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [],
      userIds.length ? db.select().from(dutyMealMonthlyPaymentsTable)
        .where(and(eq(dutyMealMonthlyPaymentsTable.mealMonth, String(month)), inArray(dutyMealMonthlyPaymentsTable.userId, userIds))) : [],
      db.select().from(companiesTable),
    ]);
    const userMap = new Map((usersData as any[]).map(u => [u.id, u]));
    const paymentMap = new Map((payments as any[]).map(p => [p.userId, p]));
    const companyMap = new Map((allCompanies as any[]).map(c => [c.id, c]));

    // Group by user
    const byUser = new Map<number, any[]>();
    for (const e of entries) {
      if (e.status === "rejected") continue;
      if (!byUser.has(e.userId)) byUser.set(e.userId, []);
      byUser.get(e.userId)!.push(e);
    }

    const rows = [];
    for (const [uid, ues] of byUser) {
      const u = userMap.get(uid) as any;
      const totalPemakaian = ues.reduce((s: number, e: any) => s + Number(e.totalBillBeforeTax), 0);
      const plafon = u?.hiredCompanyId ? await getUserPlafon(u.hiredCompanyId, u.position) : 0;
      const overAmount = Math.max(0, totalPemakaian - plafon);
      const payment = paymentMap.get(uid) as any;
      const company = u?.hiredCompanyId ? companyMap.get(u.hiredCompanyId) as any : null;
      rows.push({
        userId: uid, username: u?.username || "?", name: u?.name || "?",
        position: u?.position || "", department: u?.department || "",
        companyId: u?.hiredCompanyId || null, companyName: company?.name || "-",
        totalPemakaian, plafon, overAmount,
        paymentStatus: payment?.status || null,
        isLunas: payment?.status === "approved",
        entryCount: ues.length,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const totalPemakaian  = rows.reduce((s, r) => s + r.totalPemakaian, 0);
    const totalOverAmount = rows.reduce((s, r) => s + r.overAmount, 0);
    const totalLunas      = rows.filter(r => r.isLunas).reduce((s, r) => s + r.overAmount, 0);
    res.json({ rows, summary: { totalPemakaian, totalOverAmount, totalLunas, totalBelumLunas: totalOverAmount - totalLunas } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/duty-meals/outstanding?companyId=  (admin / approver only)
// Returns users with unpaid over-limit (overAmount > 0 and not approved) across all months
router.get("/outstanding", async (req, res) => {
  try {
    const user = req.user as any;
    const isAdmin = user.role === "admin";
    const approverCompanyIds = await getApproverCompanyIds(user.id);
    if (!isAdmin && approverCompanyIds.length === 0) {
      res.status(403).json({ error: "Forbidden" }); return;
    }
    const { companyId } = req.query;

    let scopeCompanyIds: number[] | null = null;
    if (isAdmin) {
      if (companyId) scopeCompanyIds = [Number(companyId)];
    } else {
      scopeCompanyIds = companyId
        ? approverCompanyIds.filter(id => id === Number(companyId))
        : approverCompanyIds;
    }

    // Get users in scope
    let scopedUserIds: number[];
    if (scopeCompanyIds !== null) {
      if (scopeCompanyIds.length === 0) return res.json([]);
      const scopedUsers = await db.select({ id: usersTable.id }).from(usersTable)
        .where(inArray(usersTable.hiredCompanyId, scopeCompanyIds));
      scopedUserIds = scopedUsers.map(u => u.id);
    } else {
      const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
      scopedUserIds = allUsers.map(u => u.id);
    }
    if (scopedUserIds.length === 0) return res.json([]);

    // Get all non-rejected entries for these users
    const entries = await db.select().from(dutyMealsTable)
      .where(and(inArray(dutyMealsTable.userId, scopedUserIds), ne(dutyMealsTable.status, "rejected" as any)));

    // Group by user+month
    const byUserMonth = new Map<string, any[]>();
    for (const e of entries) {
      const key = `${e.userId}:${e.mealMonth}`;
      if (!byUserMonth.has(key)) byUserMonth.set(key, []);
      byUserMonth.get(key)!.push(e);
    }

    // Get all monthly payments for these users
    const allPayments = await db.select().from(dutyMealMonthlyPaymentsTable)
      .where(inArray(dutyMealMonthlyPaymentsTable.userId, scopedUserIds));
    const paymentMap = new Map<string, any>();
    for (const p of allPayments) paymentMap.set(`${p.userId}:${p.mealMonth}`, p);

    // Get users and companies data
    const [usersData, allCompanies] = await Promise.all([
      db.select().from(usersTable).where(inArray(usersTable.id, scopedUserIds)),
      db.select().from(companiesTable),
    ]);
    const userMap = new Map((usersData as any[]).map(u => [u.id, u]));
    const companyMap = new Map((allCompanies as any[]).map(c => [c.id, c]));

    // Build outstanding rows: one row per user-month with overAmount > 0 and not lunas
    const rows: any[] = [];
    for (const [key, ues] of byUserMonth) {
      const [uidStr, mealMonth] = key.split(":");
      const uid = Number(uidStr);
      const u = userMap.get(uid) as any;
      if (!u) continue;
      const totalPemakaian = ues.reduce((s: number, e: any) => s + Number(e.totalBillBeforeTax), 0);
      const plafon = u.hiredCompanyId ? await getUserPlafon(u.hiredCompanyId, u.position) : 0;
      const overAmount = Math.max(0, totalPemakaian - plafon);
      if (overAmount === 0) continue;
      const payment = paymentMap.get(key) as any;
      if (payment?.status === "approved") continue; // lunas, skip
      const company = u.hiredCompanyId ? companyMap.get(u.hiredCompanyId) as any : null;
      rows.push({
        userId: uid, username: u.username || "?", name: u.name || "?",
        position: u.position || "", department: u.department || "",
        companyId: u.hiredCompanyId || null, companyName: company?.name || "-",
        mealMonth, totalPemakaian, plafon, overAmount,
        paymentStatus: payment?.status || null,
      });
    }

    // Sort by name then month
    rows.sort((a, b) => a.name.localeCompare(b.name) || a.mealMonth.localeCompare(b.mealMonth));
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/duty-meals/:id
router.get("/:id", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    const isApprover = await canApproveForCompany(user, meal.companyId);
    if (!isApprover && meal.userId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    res.json(meal);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/:id - update own entry (only if pending)
router.put("/:id", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (meal.userId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    if (meal.status !== "pending") { res.status(400).json({ error: "Hanya bisa edit entry pending" }); return; }

    const { brandId, mealDate, totalBillBeforeTax, description } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (brandId !== undefined) updates.brandId = brandId ? Number(brandId) : null;
    if (mealDate !== undefined) {
      const newMonth = mealDate.substring(0, 7);
      if (await isMonthLocked(newMonth)) { res.status(400).json({ error: "Periode sudah terkunci." }); return; }
      updates.mealDate = mealDate;
      updates.mealMonth = newMonth;
    }
    if (totalBillBeforeTax !== undefined) updates.totalBillBeforeTax = String(totalBillBeforeTax);
    if (description !== undefined) updates.description = description;

    const [updated] = await db.update(dutyMealsTable).set(updates).where(eq(dutyMealsTable.id, Number(req.params.id))).returning();
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/duty-meals/:id
router.delete("/:id", async (req, res) => {
  try {
    const user = req.user as any;
    const isAdmin = user.role === "admin";
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (meal.userId !== user.id && !isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }
    // Admin can delete any status; regular user only pending
    if (!isAdmin && meal.status !== "pending") { res.status(400).json({ error: "Hanya bisa hapus entry pending" }); return; }
    await createAuditLog(user.id, "DELETE", "duty_meal", meal.id, `Duty meal dihapus oleh ${user.username} (status: ${meal.status})`);
    await db.delete(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/duty-meals/:id/upload-receipt (struk makanan per entry)
router.post("/:id/upload-receipt", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (meal.userId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    if (await isMonthLocked(meal.mealMonth!)) {
      res.status(400).json({ error: "Periode bulan ini sudah terkunci. Tidak bisa upload struk." });
      return;
    }

    const { fileData, filename } = req.body;
    if (!fileData) { res.status(400).json({ error: "fileData required" }); return; }

    // Look up brand for filename (reuse `meal` already fetched above)
    let brandName = "";
    if (meal?.brandId) {
      const [br] = await db.select({ name: brandsTable.name }).from(brandsTable).where(eq(brandsTable.id, meal.brandId));
      brandName = br?.name || "";
    }
    const mealDate = meal?.mealDate ? String(meal.mealDate).substring(0, 10) : undefined;

    const gdrive = await uploadToGDrive(fileData, filename || "struk.jpg", {
      mealDate,
      brandName,
      username: user.username,
      fullName: user.name || user.username,
      originalFilename: filename || "struk.jpg",
    });
    const gdriveOk = gdrive && !gdrive.error && !!gdrive.fileId;

    const [updated] = await db.update(dutyMealsTable)
      .set({
        receiptData: gdriveOk ? null : fileData,
        receiptFilename: filename || "struk.jpg",
        gdriveFileId: gdriveOk ? gdrive!.fileId : null,
        gdriveFileUrl: gdriveOk ? gdrive!.fileUrl : null,
        updatedAt: new Date(),
      } as any)
      .where(eq(dutyMealsTable.id, Number(req.params.id)))
      .returning();

    await createAuditLog(user.id, "UPLOAD_RECEIPT", "duty_meal", Number(req.params.id),
      gdriveOk ? `Struk diupload ke Google Drive` : `Struk disimpan di sistem${gdrive?.error ? ` | GDrive error: ${gdrive.error}` : ""}`);

    res.json({
      success: true,
      meal: updated,
      uploadedToGdrive: gdriveOk,
      gdriveUrl: gdriveOk ? gdrive!.fileUrl : null,
      gdriveWarning: gdrive?.error || null,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/:id/approve  (Duty Meal Approver per PT / Admin)
router.put("/:id/approve", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (!await canApproveForCompany(user, meal.companyId)) {
      res.status(403).json({ error: "Anda tidak memiliki akses untuk approve entri PT ini" }); return;
    }
    const [updated] = await db.update(dutyMealsTable)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(dutyMealsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "APPROVE", "duty_meal", Number(req.params.id), `Duty meal entry disetujui oleh ${user.username}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/:id/reject  (Duty Meal Approver per PT / Admin)
router.put("/:id/reject", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (!await canApproveForCompany(user, meal.companyId)) {
      res.status(403).json({ error: "Anda tidak memiliki akses untuk reject entri PT ini" }); return;
    }
    const { reason } = req.body;
    const [updated] = await db.update(dutyMealsTable)
      .set({ status: "rejected", rejectionReason: reason || null, updatedAt: new Date() })
      .where(eq(dutyMealsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "REJECT", "duty_meal", Number(req.params.id), `Duty meal entry ditolak: ${reason || "-"}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
