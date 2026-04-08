import { Router } from "express";
import { db } from "../lib/db.js";
import { apiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import crypto from "crypto";

const router = Router();

function generateApiKey(): string {
  return "pf_" + crypto.randomBytes(24).toString("hex");
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// List all keys (admin only)
router.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const keys = await db
      .select({
        id: apiKeysTable.id,
        name: apiKeysTable.name,
        keyPrefix: apiKeysTable.keyPrefix,
        permissions: apiKeysTable.permissions,
        isActive: apiKeysTable.isActive,
        createdBy: apiKeysTable.createdBy,
        createdAt: apiKeysTable.createdAt,
        lastUsedAt: apiKeysTable.lastUsedAt,
      })
      .from(apiKeysTable)
      .orderBy(apiKeysTable.createdAt);
    res.json(keys);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new API key (admin only) — returns raw key ONCE, never stored
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, permissions } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: "Field 'name' wajib diisi." });
    return;
  }

  const validPermissions = ["items", "uoms", "all"];
  const perms: string[] = Array.isArray(permissions)
    ? permissions.filter((p: string) => validPermissions.includes(p))
    : ["all"];

  const rawKey = generateApiKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12) + "...";
  const now = Date.now();

  try {
    const [created] = await db
      .insert(apiKeysTable)
      .values({
        name: name.trim(),
        keyHash,
        keyPrefix,
        permissions: perms,
        isActive: true,
        createdBy: (req as any).user?.username ?? "admin",
        createdAt: now,
        lastUsedAt: null,
      })
      .returning();

    res.json({
      success: true,
      message: "API Key berhasil dibuat. Simpan key ini sekarang — tidak akan ditampilkan lagi!",
      apiKey: rawKey,
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      permissions: created.permissions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke / deactivate a key (admin only)
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [updated] = await db
      .update(apiKeysTable)
      .set({ isActive: false })
      .where(eq(apiKeysTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "API Key tidak ditemukan" }); return; }
    res.json({ success: true, message: `API Key '${updated.name}' dinonaktifkan.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Re-activate a key
router.patch("/:id/activate", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const [updated] = await db
      .update(apiKeysTable)
      .set({ isActive: true })
      .where(eq(apiKeysTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "API Key tidak ditemukan" }); return; }
    res.json({ success: true, message: `API Key '${updated.name}' diaktifkan kembali.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
