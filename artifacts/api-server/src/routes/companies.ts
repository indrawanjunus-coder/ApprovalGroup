import { Router } from "express";
import { db } from "@workspace/db";
import { companiesTable, userCompaniesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  try {
    const companies = await db.select().from(companiesTable).orderBy(companiesTable.name);
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { name, code, address } = req.body;
  if (!name || !code) {
    res.status(400).json({ error: "Bad Request", message: "Name and code required" }); return;
  }
  try {
    const [company] = await db.insert(companiesTable).values({ name, code, address }).returning();
    await createAuditLog(req.user!.id, "create_company", "setting", company.id, `Created company ${name}`);
    res.status(201).json(company);
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Bad Request", message: "Company code already exists" }); return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, code, address, isActive } = req.body;
  try {
    const [company] = await db.update(companiesTable)
      .set({ name, code, address, isActive: isActive !== undefined ? String(isActive) : undefined, updatedAt: new Date() })
      .where(eq(companiesTable.id, id))
      .returning();
    if (!company) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.companyId, String(id)));
    await db.delete(companiesTable).where(eq(companiesTable.id, id));
    res.json({ success: true, message: "Company deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
