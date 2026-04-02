import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { handleRouteError } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

// GET /api/brands?companyId=1
router.get("/", async (req, res) => {
  try {
    const { companyId, activeOnly } = req.query;
    let query = db.select().from(brandsTable);
    const conditions = [];
    if (companyId) conditions.push(eq(brandsTable.companyId, Number(companyId)));
    if (activeOnly === "true") conditions.push(eq(brandsTable.isActive, true));
    const brands = conditions.length
      ? await db.select().from(brandsTable).where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : await db.select().from(brandsTable);
    res.json(brands);
  } catch (err) { handleRouteError(res, err); }
});

// POST /api/brands
router.post("/", requireRole("admin"), async (req, res) => {
  try {
    const { companyId, name, isActive } = req.body;
    if (!companyId || !name) { res.status(400).json({ error: "companyId and name required" }); return; }
    const [brand] = await db.insert(brandsTable).values({
      companyId: Number(companyId),
      name: name.trim(),
      isActive: isActive !== false,
    }).returning();
    res.json(brand);
  } catch (err) { handleRouteError(res, err); }
});

// PUT /api/brands/:id
router.put("/:id", requireRole("admin"), async (req, res) => {
  try {
    const { name, isActive, companyId } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (isActive !== undefined) updates.isActive = isActive;
    if (companyId !== undefined) updates.companyId = Number(companyId);
    const [brand] = await db.update(brandsTable).set(updates).where(eq(brandsTable.id, Number(req.params.id))).returning();
    if (!brand) { res.status(404).json({ error: "Brand not found" }); return; }
    res.json(brand);
  } catch (err) { handleRouteError(res, err); }
});

// DELETE /api/brands/:id
router.delete("/:id", requireRole("admin"), async (req, res) => {
  try {
    await db.delete(brandsTable).where(eq(brandsTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { handleRouteError(res, err); }
});

export default router;
