import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { prTypesTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(prTypesTable)
      .orderBy(asc(prTypesTable.id));
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Gagal memuat jenis request" });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { code, label, description } = req.body;
    if (!code?.trim() || !label?.trim()) return res.status(400).json({ error: "Kode dan label wajib diisi" });
    const safeCode = code.trim().toLowerCase().replace(/\s+/g, "_");
    const [row] = await db
      .insert(prTypesTable)
      .values({ code: safeCode, label: label.trim(), description: description || null, isSystem: false })
      .returning();
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === "23505") return res.status(400).json({ error: "Kode jenis request sudah ada" });
    res.status(500).json({ error: "Gagal menambah jenis request" });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await db.select().from(prTypesTable).where(eq(prTypesTable.id, id));
    if (!existing.length) return res.status(404).json({ error: "Jenis request tidak ditemukan" });

    const { label, description, isActive } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: "Label wajib diisi" });

    const [row] = await db
      .update(prTypesTable)
      .set({ label: label.trim(), description: description || null, isActive: isActive !== false, updatedAt: new Date() })
      .where(eq(prTypesTable.id, id))
      .returning();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: "Gagal memperbarui jenis request" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(prTypesTable).where(eq(prTypesTable.id, id));
    if (!existing) return res.status(404).json({ error: "Jenis request tidak ditemukan" });
    if (existing.isSystem) return res.status(400).json({ error: "Jenis request bawaan sistem tidak dapat dihapus" });
    await db.delete(prTypesTable).where(eq(prTypesTable.id, id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Gagal menghapus jenis request" });
  }
});

export default router;
