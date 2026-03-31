import { Router } from "express";
import { db } from "@workspace/db";
import { dutyMealsTable, dutyMealPlafonTable, brandsTable, usersTable } from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// Helper: get setting value
async function getSetting(key: string): Promise<string> {
  const rows = await db.execute(sql`SELECT value FROM settings WHERE key = ${key}`);
  const row = (rows as any).rows?.[0];
  return row?.value ?? "";
}

// Helper: check if date is locked for a given meal_month (YYYY-MM)
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

// Helper: get user plafon for given company & position
async function getUserPlafon(companyId: number, position: string): Promise<number> {
  const plafons = await db.select().from(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.companyId, companyId));
  if (plafons.length === 0) return 500000;
  // exact match first
  const exact = plafons.find(p => p.positionName.toLowerCase() === position.toLowerCase());
  if (exact) return Number(exact.amount);
  // partial match
  const lp = position.toLowerCase();
  if (lp.includes("general manager")) {
    const gm = plafons.find(p => p.positionName.toLowerCase().includes("general manager"));
    if (gm) return Number(gm.amount);
  }
  if (lp.includes("assistant manager") || lp.includes("asst manager") || lp.includes("ass. manager")) {
    const am = plafons.find(p => p.positionName.toLowerCase().includes("assistant"));
    if (am) return Number(am.amount);
  }
  if (lp.includes("manager")) {
    const m = plafons.find(p => p.positionName.toLowerCase() === "manager");
    if (m) return Number(m.amount);
  }
  const staff = plafons.find(p => p.positionName.toLowerCase().includes("staff"));
  if (staff) return Number(staff.amount);
  // return smallest
  const sorted = [...plafons].sort((a, b) => Number(a.amount) - Number(b.amount));
  return Number(sorted[0].amount);
}

// ─── PLAFON ENDPOINTS ───────────────────────────────────────────────────

// GET /api/duty-meals/plafon?companyId=
router.get("/plafon", async (req, res) => {
  try {
    const { companyId } = req.query;
    const rows = companyId
      ? await db.select().from(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.companyId, Number(companyId)))
      : await db.select().from(dutyMealPlafonTable);
    res.json(rows);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/duty-meals/plafon
router.post("/plafon", requireRole("admin"), async (req, res) => {
  try {
    const { companyId, positionName, amount } = req.body;
    if (!companyId || !positionName || amount === undefined) { res.status(400).json({ error: "Required fields missing" }); return; }
    const [row] = await db.insert(dutyMealPlafonTable).values({
      companyId: Number(companyId), positionName: positionName.trim(), amount: String(amount),
    }).returning();
    res.json(row);
  } catch (err: any) {
    if (err.code === "23505") { res.status(400).json({ error: "Plafon for this company & position already exists" }); return; }
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/duty-meals/plafon/:id
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

// DELETE /api/duty-meals/plafon/:id
router.delete("/plafon/:id", requireRole("admin"), async (req, res) => {
  try {
    await db.delete(dutyMealPlafonTable).where(eq(dutyMealPlafonTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── MY PLAFON ───────────────────────────────────────────────────────────

// GET /api/duty-meals/my-plafon
router.get("/my-plafon", async (req, res) => {
  try {
    const user = req.user as any;
    if (!user.hiredCompanyId) { res.json({ amount: 0 }); return; }
    const amount = await getUserPlafon(user.hiredCompanyId, user.position);
    res.json({ amount, position: user.position });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// ─── DUTY MEAL ENTRIES ────────────────────────────────────────────────────

// GET /api/duty-meals?month=2025-01&userId=  (HRD/admin can see all, others see own)
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
    if (month) {
      filters.push(eq(dutyMealsTable.mealMonth, String(month)));
    }

    const meals = filters.length
      ? await db.select().from(dutyMealsTable).where(filters.length === 1 ? filters[0] : and(...filters))
      : await db.select().from(dutyMealsTable);

    // Enrich with user + brand info
    const userIds = [...new Set(meals.map(m => m.userId))];
    const brandIds = [...new Set(meals.map(m => m.brandId).filter(Boolean))];
    const companyIds = [...new Set(meals.map(m => m.companyId).filter(Boolean))];

    const [usersRows, brandsRows] = await Promise.all([
      userIds.length ? db.execute(sql`SELECT id, name, position, department, hired_company_id FROM users WHERE id = ANY(${userIds})`) : { rows: [] },
      brandIds.length ? db.select().from(brandsTable).where(sql`id = ANY(${brandIds})`) : [],
    ]);

    const userMap = new Map((usersRows as any).rows.map((u: any) => [u.id, u]));
    const brandMap = new Map((brandsRows as any[]).map((b: any) => [b.id, b]));

    // For each user in results, fetch plafon
    const plafonMap = new Map<number, number>();
    for (const uid of userIds) {
      const u = userMap.get(uid) as any;
      if (u?.hired_company_id) {
        const p = await getUserPlafon(u.hired_company_id, u.position);
        plafonMap.set(uid, p);
      }
    }

    // Group by userId+month and compute monthly totals
    const monthlyTotals = new Map<string, number>();
    for (const m of meals) {
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
        isOverPlafon: monthTotal > plafon,
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

    const { brandId, mealDate, totalBillBeforeTax, description } = req.body;
    if (!mealDate || totalBillBeforeTax === undefined) { res.status(400).json({ error: "mealDate dan totalBillBeforeTax wajib diisi" }); return; }

    const mealMonth = mealDate.substring(0, 7); // YYYY-MM
    if (await isMonthLocked(mealMonth)) {
      res.status(400).json({ error: "Periode bulan tersebut sudah terkunci. Tidak bisa menambah Duty Meal untuk bulan lalu." });
      return;
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
    }).returning();

    res.json(meal);
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
    if (meal.status !== "pending") { res.status(400).json({ error: "Hanya bisa edit entry dengan status pending" }); return; }

    const { brandId, mealDate, totalBillBeforeTax, description } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (brandId !== undefined) updates.brandId = brandId ? Number(brandId) : null;
    if (mealDate !== undefined) {
      const newMonth = mealDate.substring(0, 7);
      if (await isMonthLocked(newMonth)) {
        res.status(400).json({ error: "Periode bulan tersebut sudah terkunci." }); return;
      }
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
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (meal.userId !== user.id && user.role !== "admin") { res.status(403).json({ error: "Forbidden" }); return; }
    if (meal.status !== "pending") { res.status(400).json({ error: "Hanya bisa hapus entry pending" }); return; }
    await db.delete(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/duty-meals/:id/upload-proof
router.post("/:id/upload-proof", async (req, res) => {
  try {
    const user = req.user as any;
    const [meal] = await db.select().from(dutyMealsTable).where(eq(dutyMealsTable.id, Number(req.params.id)));
    if (!meal) { res.status(404).json({ error: "Not found" }); return; }
    if (meal.userId !== user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const { fileData, filename } = req.body;
    if (!fileData) { res.status(400).json({ error: "fileData required" }); return; }

    const [updated] = await db.update(dutyMealsTable)
      .set({ paymentProofData: fileData, paymentProofFilename: filename || "bukti.jpg", updatedAt: new Date() })
      .where(eq(dutyMealsTable.id, Number(req.params.id)))
      .returning();
    res.json({ success: true, meal: updated });
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
      .where(eq(dutyMealsTable.id, Number(req.params.id)))
      .returning();
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
      .where(eq(dutyMealsTable.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/duty-meals/report/summary?month=  (HRD/admin only)
router.get("/report/summary", async (req, res) => {
  try {
    const user = req.user as any;
    const isHrd = user.department?.toUpperCase() === "HRD" || user.role === "admin";
    if (!isHrd) { res.status(403).json({ error: "Forbidden" }); return; }

    const { month } = req.query;
    const filter = month ? eq(dutyMealsTable.mealMonth, String(month)) : undefined;
    const meals = filter
      ? await db.select().from(dutyMealsTable).where(filter)
      : await db.select().from(dutyMealsTable);

    // Aggregate by userId+month
    const summary: Record<string, any> = {};
    for (const m of meals) {
      const key = `${m.userId}:${m.mealMonth}`;
      if (!summary[key]) {
        summary[key] = { userId: m.userId, mealMonth: m.mealMonth, total: 0, entries: [] };
      }
      summary[key].total += Number(m.totalBillBeforeTax);
      summary[key].entries.push(m);
    }
    res.json(Object.values(summary));
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
