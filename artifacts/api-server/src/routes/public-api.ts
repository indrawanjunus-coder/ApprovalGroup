import { Router, Request, Response, NextFunction } from "express";
import { db } from "../lib/db.js";
import { apiKeysTable, masterItemsTable, masterUomsTable } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// ─── API Docs ──────────────────────────────────────────────────────────────

router.get("/", (_req, res) => {
  res.json({
    name: "ProcureFlow Public API",
    version: "v1",
    baseUrl: "/api/v1",
    authentication: {
      method: "API Key",
      header: "X-API-Key",
      alternative: "Authorization: Bearer <api-key>",
      description: "Dapatkan API Key dari administrator ProcureFlow di menu Settings > API Keys.",
    },
    endpoints: {
      uoms: {
        "GET /api/v1/uoms": "Ambil semua Satuan (UoM) aktif",
        "GET /api/v1/uoms/:code": "Ambil UoM berdasarkan kode",
        "POST /api/v1/uoms": "Tambah atau perbarui 1 UoM",
        "POST /api/v1/uoms/bulk": "Tambah atau perbarui banyak UoM sekaligus (max 500)",
        "DELETE /api/v1/uoms/:code": "Nonaktifkan UoM",
      },
      items: {
        "GET /api/v1/items": "Ambil semua Item aktif",
        "GET /api/v1/items/:code": "Ambil Item berdasarkan kode",
        "POST /api/v1/items": "Tambah atau perbarui 1 Item",
        "POST /api/v1/items/bulk": "Tambah atau perbarui banyak Item sekaligus (max 500)",
        "DELETE /api/v1/items/:code": "Nonaktifkan Item",
      },
    },
    schemas: {
      uom: {
        code: "string (required) — kode unik satuan, contoh: 'PCS', 'KG', 'LTR'",
        name: "string (required) — nama satuan, contoh: 'Pieces', 'Kilogram'",
        is_active: "boolean (optional, default: true)",
      },
      item: {
        code: "string (required) — kode unik item/barang",
        name: "string (required) — nama item",
        description: "string (optional)",
        category: "string (optional) — kategori item",
        default_uom_code: "string (optional) — kode UoM default, harus sudah ada di master UoM",
        is_active: "boolean (optional, default: true)",
      },
    },
    notes: [
      "Semua operasi POST menggunakan upsert (insert jika baru, update jika sudah ada berdasarkan code).",
      "Kode (code) bersifat case-sensitive dan harus unik.",
      "Untuk bulk, kirim array di field 'data'. Maksimal 500 item per request.",
    ],
    examples: {
      single_uom: {
        method: "POST",
        url: "/api/v1/uoms",
        headers: { "X-API-Key": "pf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "Content-Type": "application/json" },
        body: { code: "PCS", name: "Pieces" },
      },
      bulk_items: {
        method: "POST",
        url: "/api/v1/items/bulk",
        headers: { "X-API-Key": "pf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "Content-Type": "application/json" },
        body: {
          data: [
            { code: "ITM001", name: "Baut M8", category: "Hardware", default_uom_code: "PCS" },
            { code: "ITM002", name: "Cat Tembok Putih 5kg", category: "Material", default_uom_code: "KLG" },
          ],
        },
      },
    },
  });
});

// ─── API Key Middleware ────────────────────────────────────────────────────

async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey =
    req.headers["x-api-key"] as string ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");

  if (!rawKey || !rawKey.startsWith("pf_")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "API Key diperlukan. Sertakan header X-API-Key dengan nilai yang valid.",
    });
    return;
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  try {
    const [apiKey] = await db
      .select()
      .from(apiKeysTable)
      .where(and(eq(apiKeysTable.keyHash, keyHash), eq(apiKeysTable.isActive, true)));

    if (!apiKey) {
      res.status(401).json({ error: "Unauthorized", message: "API Key tidak valid atau sudah dinonaktifkan." });
      return;
    }

    // Update last_used_at (async, non-blocking)
    db.update(apiKeysTable)
      .set({ lastUsedAt: Date.now() })
      .where(eq(apiKeysTable.id, apiKey.id))
      .catch(() => {});

    (req as any).apiKey = apiKey;
    next();
  } catch (err: any) {
    console.error("[PublicAPI] Auth error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ─── UoM Endpoints ────────────────────────────────────────────────────────

router.get("/uoms", requireApiKey, async (_req, res) => {
  try {
    const uoms = await db
      .select()
      .from(masterUomsTable)
      .where(eq(masterUomsTable.isActive, true))
      .orderBy(masterUomsTable.code);
    res.json({ success: true, count: uoms.length, data: uoms.map(formatUom) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/uoms/:code", requireApiKey, async (req, res) => {
  try {
    const [uom] = await db
      .select()
      .from(masterUomsTable)
      .where(eq(masterUomsTable.code, req.params.code));
    if (!uom) { res.status(404).json({ error: "UoM tidak ditemukan", code: req.params.code }); return; }
    res.json({ success: true, data: formatUom(uom) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/uoms", requireApiKey, async (req, res) => {
  const result = await upsertUom(req.body);
  res.status(result.error ? 400 : 200).json(result);
});

router.post("/uoms/bulk", requireApiKey, async (req, res) => {
  const rows = req.body?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Field 'data' harus berupa array yang tidak kosong." });
    return;
  }
  if (rows.length > 500) {
    res.status(400).json({ error: "Maksimal 500 item per request." });
    return;
  }
  const results = await Promise.all(rows.map(upsertUom));
  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error);
  res.json({
    success: failed.length === 0,
    total: rows.length,
    succeeded,
    failed: failed.length,
    errors: failed.length > 0 ? failed : undefined,
  });
});

router.delete("/uoms/:code", requireApiKey, async (req, res) => {
  try {
    const [updated] = await db
      .update(masterUomsTable)
      .set({ isActive: false, updatedAt: Date.now() })
      .where(eq(masterUomsTable.code, req.params.code))
      .returning();
    if (!updated) { res.status(404).json({ error: "UoM tidak ditemukan" }); return; }
    res.json({ success: true, message: `UoM '${req.params.code}' dinonaktifkan.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Item Endpoints ───────────────────────────────────────────────────────

router.get("/items", requireApiKey, async (_req, res) => {
  try {
    const items = await db
      .select()
      .from(masterItemsTable)
      .where(eq(masterItemsTable.isActive, true))
      .orderBy(masterItemsTable.code);
    res.json({ success: true, count: items.length, data: await Promise.all(items.map(formatItem)) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/items/:code", requireApiKey, async (req, res) => {
  try {
    const [item] = await db
      .select()
      .from(masterItemsTable)
      .where(eq(masterItemsTable.code, req.params.code));
    if (!item) { res.status(404).json({ error: "Item tidak ditemukan", code: req.params.code }); return; }
    res.json({ success: true, data: await formatItem(item) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/items", requireApiKey, async (req, res) => {
  const result = await upsertItem(req.body);
  res.status(result.error ? 400 : 200).json(result);
});

router.post("/items/bulk", requireApiKey, async (req, res) => {
  const rows = req.body?.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: "Field 'data' harus berupa array yang tidak kosong." });
    return;
  }
  if (rows.length > 500) {
    res.status(400).json({ error: "Maksimal 500 item per request." });
    return;
  }
  const results = await Promise.all(rows.map(upsertItem));
  const succeeded = results.filter(r => !r.error).length;
  const failed = results.filter(r => r.error);
  res.json({
    success: failed.length === 0,
    total: rows.length,
    succeeded,
    failed: failed.length,
    errors: failed.length > 0 ? failed : undefined,
  });
});

router.delete("/items/:code", requireApiKey, async (req, res) => {
  try {
    const [updated] = await db
      .update(masterItemsTable)
      .set({ isActive: false, updatedAt: Date.now() })
      .where(eq(masterItemsTable.code, req.params.code))
      .returning();
    if (!updated) { res.status(404).json({ error: "Item tidak ditemukan" }); return; }
    res.json({ success: true, message: `Item '${req.params.code}' dinonaktifkan.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatUom(u: typeof masterUomsTable.$inferSelect) {
  return {
    id: u.id,
    code: u.code,
    name: u.name,
    is_active: u.isActive,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

async function formatItem(item: typeof masterItemsTable.$inferSelect) {
  let defaultUomCode: string | null = null;
  if (item.defaultUomId) {
    const [uom] = await db.select().from(masterUomsTable).where(eq(masterUomsTable.id, item.defaultUomId));
    defaultUomCode = uom?.code ?? null;
  }
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    description: item.description,
    category: item.category,
    default_uom_id: item.defaultUomId,
    default_uom_code: defaultUomCode,
    is_active: item.isActive,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

async function upsertUom(data: any): Promise<any> {
  const code = (data?.code || "").trim();
  const name = (data?.name || "").trim();
  if (!code) return { error: "Field 'code' wajib diisi." };
  if (!name) return { error: "Field 'name' wajib diisi.", code };

  const now = Date.now();
  try {
    const [existing] = await db.select().from(masterUomsTable).where(eq(masterUomsTable.code, code));
    if (existing) {
      const [updated] = await db.update(masterUomsTable)
        .set({ name, isActive: data.is_active ?? true, updatedAt: now })
        .where(eq(masterUomsTable.code, code))
        .returning();
      return { success: true, action: "updated", data: formatUom(updated) };
    } else {
      const [inserted] = await db.insert(masterUomsTable)
        .values({ code, name, isActive: data.is_active ?? true, createdAt: now, updatedAt: now })
        .returning();
      return { success: true, action: "created", data: formatUom(inserted) };
    }
  } catch (err: any) {
    return { error: err.message, code };
  }
}

async function upsertItem(data: any): Promise<any> {
  const code = (data?.code || "").trim();
  const name = (data?.name || "").trim();
  if (!code) return { error: "Field 'code' wajib diisi." };
  if (!name) return { error: "Field 'name' wajib diisi.", code };

  const now = Date.now();
  let defaultUomId: number | null = null;

  if (data.default_uom_code) {
    const [uom] = await db.select().from(masterUomsTable)
      .where(and(eq(masterUomsTable.code, data.default_uom_code), eq(masterUomsTable.isActive, true)));
    if (!uom) return { error: `UoM '${data.default_uom_code}' tidak ditemukan atau tidak aktif.`, code };
    defaultUomId = uom.id;
  }

  try {
    const [existing] = await db.select().from(masterItemsTable).where(eq(masterItemsTable.code, code));
    const payload = {
      name,
      description: data.description ?? null,
      category: data.category ?? null,
      defaultUomId: defaultUomId ?? existing?.defaultUomId ?? null,
      isActive: data.is_active ?? true,
      updatedAt: now,
    };
    if (existing) {
      const [updated] = await db.update(masterItemsTable).set(payload).where(eq(masterItemsTable.code, code)).returning();
      return { success: true, action: "updated", data: await formatItem(updated) };
    } else {
      const [inserted] = await db.insert(masterItemsTable)
        .values({ code, ...payload, createdAt: now })
        .returning();
      return { success: true, action: "created", data: await formatItem(inserted) };
    }
  } catch (err: any) {
    return { error: err.message, code };
  }
}

export default router;
