import { Router } from "express";
import { db } from "@workspace/db";
import { dutyMealsTable, dutyMealPlafonTable, brandsTable, usersTable, dutyMealMonthlyPaymentsTable } from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
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
  mealDate?: string;    // "YYYY-MM-DD"
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
    let targetFolder = rootFolder;
    if (meta?.mealDate) {
      const year = meta.mealDate.substring(0, 4);
      const yearMonth = meta.mealDate.substring(0, 7);
      const yearFolder = await getOrCreateFolder(drive, year, rootFolder);
      targetFolder = await getOrCreateFolder(drive, yearMonth, yearFolder);
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
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    const { month } = req.query;

    const filters: any[] = [];
    if (!isHrd) filters.push(eq(dutyMealMonthlyPaymentsTable.userId, user.id));
    if (month) filters.push(eq(dutyMealMonthlyPaymentsTable.mealMonth, String(month)));

    const rows = filters.length
      ? await db.select().from(dutyMealMonthlyPaymentsTable).where(filters.length === 1 ? filters[0] : and(...filters))
      : await db.select().from(dutyMealMonthlyPaymentsTable);

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

    // Upload to GDrive if configured
    const gdrive = await uploadToGDrive(fileData, filename || "bukti_pembayaran.jpg");
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

// PUT /api/duty-meals/monthly-payment/:id/approve (HRD)
router.put("/monthly-payment/:id/approve", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    if (!isHrd) { res.status(403).json({ error: "Hanya HRD yang bisa approve" }); return; }
    const [updated] = await db.update(dutyMealMonthlyPaymentsTable)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(dutyMealMonthlyPaymentsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "APPROVE", "duty_meal_monthly_payment", Number(req.params.id), `Pembayaran bulanan disetujui oleh ${user.username}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/monthly-payment/:id/reject (HRD)
router.put("/monthly-payment/:id/reject", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    if (!isHrd) { res.status(403).json({ error: "Hanya HRD yang bisa reject" }); return; }
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
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";

    const filters: any[] = [];
    if (!isHrd) {
      filters.push(eq(dutyMealsTable.userId, user.id));
    } else if (userId) {
      filters.push(eq(dutyMealsTable.userId, Number(userId)));
    }
    if (month) filters.push(eq(dutyMealsTable.mealMonth, String(month)));

    const meals = filters.length
      ? await db.select().from(dutyMealsTable).where(filters.length === 1 ? filters[0] : and(...filters))
      : await db.select().from(dutyMealsTable);

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

// GET /api/duty-meals/:id
router.get("/:id", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (!isHrd && meal.userId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }
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

// PUT /api/duty-meals/:id/approve  (HRD only)
router.put("/:id/approve", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    if (!isHrd) { res.status(403).json({ error: "Hanya HRD yang bisa approve" }); return; }
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    const [updated] = await db.update(dutyMealsTable)
      .set({ status: "approved", approvedBy: user.id, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(dutyMealsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "APPROVE", "duty_meal", Number(req.params.id), `Duty meal entry disetujui oleh ${user.username}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/duty-meals/:id/reject  (HRD only)
router.put("/:id/reject", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    if (!isHrd) { res.status(403).json({ error: "Hanya HRD yang bisa reject" }); return; }
    const { reason } = req.body;
    const [updated] = await db.update(dutyMealsTable)
      .set({ status: "rejected", rejectionReason: reason || null, updatedAt: new Date() })
      .where(eq(dutyMealsTable.id, Number(req.params.id))).returning();
    await createAuditLog(user.id, "REJECT", "duty_meal", Number(req.params.id), `Duty meal entry ditolak: ${reason || "-"}`);
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
