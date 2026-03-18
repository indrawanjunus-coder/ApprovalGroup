import { Router } from "express";
import { db } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth.js";
import { sql } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, code, name, description, company_id, is_active, created_at, updated_at
      FROM locations
      ORDER BY name ASC
    `);
    const rows = (result as any).rows || [];
    res.json({ locations: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { code, name, description, companyId } = req.body;
  if (!code || !name) { res.status(400).json({ error: "Kode dan nama lokasi wajib diisi" }); return; }
  const safeCode = code.trim().toUpperCase().replace(/\s+/g, "-");
  try {
    const result = await db.execute(sql`
      INSERT INTO locations (code, name, description, company_id)
      VALUES (${safeCode}, ${name}, ${description || null}, ${companyId || null})
      RETURNING id, code, name, description, company_id, is_active, created_at, updated_at
    `);
    res.status(201).json((result as any).rows[0]);
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Kode lokasi sudah digunakan" }); return; }
    console.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, companyId, isActive } = req.body;
  if (!name) { res.status(400).json({ error: "Nama lokasi wajib diisi" }); return; }
  try {
    const result = await db.execute(sql`
      UPDATE locations
      SET name=${name}, description=${description || null}, company_id=${companyId || null},
          is_active=${isActive !== false}, updated_at=NOW()
      WHERE id=${id}
      RETURNING id, code, name, description, company_id, is_active, created_at, updated_at
    `);
    const rows = (result as any).rows || [];
    if (!rows.length) { res.status(404).json({ error: "Lokasi tidak ditemukan" }); return; }
    res.json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await db.execute(sql`DELETE FROM locations WHERE id=${id}`);
    res.json({ message: "Lokasi dihapus" });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
