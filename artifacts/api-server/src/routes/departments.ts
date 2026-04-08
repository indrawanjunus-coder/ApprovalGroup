import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { departmentsTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(departmentsTable)
      .orderBy(asc(departmentsTable.name));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Gagal memuat departemen" });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nama departemen wajib diisi" });
    const [row] = await db
      .insert(departmentsTable)
      .values({ name: name.trim(), description: description || null })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "Nama departemen sudah ada" });
    res.status(500).json({ error: "Gagal menambah departemen" });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, isActive } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nama departemen wajib diisi" });
    const [row] = await db
      .update(departmentsTable)
      .set({ name: name.trim(), description: description || null, isActive: isActive !== false, updatedAt: new Date() })
      .where(eq(departmentsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Departemen tidak ditemukan" });
    res.json(row);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "Nama departemen sudah ada" });
    res.status(500).json({ error: "Gagal memperbarui departemen" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(departmentsTable).where(eq(departmentsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal menghapus departemen" });
  }
});

export default router;
