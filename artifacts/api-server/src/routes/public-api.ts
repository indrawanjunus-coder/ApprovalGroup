import { Router, Request, Response, NextFunction } from "express";
import { db } from "../lib/db.js";
import { apiKeysTable, masterItemsTable, masterUomsTable } from "@workspace/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

// ─── API Docs ──────────────────────────────────────────────────────────────

const API_DOCS_JSON = {
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
};

router.get("/", (req, res) => {
  const acceptsHtml = req.headers.accept?.includes("text/html");
  if (!acceptsHtml) {
    res.json(API_DOCS_JSON);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>ProcureFlow Public API v1</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Layout */
  .container { max-width: 900px; margin: 0 auto; padding: 0 24px 80px; }

  /* Header */
  .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 48px 0 40px; margin-bottom: 40px; }
  .header .container { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .header-title { font-size: 28px; font-weight: 700; }
  .header-sub { font-size: 14px; opacity: 0.8; margin-top: 4px; }
  .version-badge { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }

  /* Cards */
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px; overflow: hidden; }
  .card-header { padding: 16px 20px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap-10px; }
  .card-title { font-size: 15px; font-weight: 700; color: #0f172a; }
  .card-body { padding: 20px; }

  /* Sections */
  .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 12px; }

  /* Auth box */
  .auth-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 600px) { .auth-grid { grid-template-columns: 1fr; } }
  .auth-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
  .auth-item-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .auth-item-value { font-size: 14px; font-weight: 500; color: #0f172a; }
  .auth-item-value code { background: #eff6ff; color: #1d4ed8; padding: 2px 6px; border-radius: 4px; font-size: 13px; }

  /* Note box */
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; font-size: 13px; color: #92400e; margin-top: 16px; }
  .note strong { color: #78350f; }

  /* Endpoint list */
  .endpoint-group { margin-bottom: 28px; }
  .endpoint-group:last-child { margin-bottom: 0; }
  .group-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  .endpoint-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
  .endpoint-row:last-child { border-bottom: none; padding-bottom: 0; }

  /* Method badges */
  .badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 5px; min-width: 54px; text-align: center; }
  .badge-GET    { background: #dcfce7; color: #15803d; }
  .badge-POST   { background: #dbeafe; color: #1d4ed8; }
  .badge-DELETE { background: #fee2e2; color: #b91c1c; }
  .endpoint-path { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; color: #334155; flex: 1; }
  .endpoint-path .param { color: #7c3aed; }
  .endpoint-desc { font-size: 13px; color: #64748b; }

  /* Code blocks */
  .code-block { background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 16px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12.5px; line-height: 1.7; overflow-x: auto; margin-top: 8px; }
  .code-block .str { color: #86efac; }
  .code-block .key { color: #93c5fd; }
  .code-block .kw  { color: #f472b6; }
  .code-block .num { color: #fdba74; }
  .code-block .comment { color: #64748b; font-style: italic; }

  /* Schema table */
  .schema-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .schema-table th { text-align: left; padding: 8px 12px; background: #f8fafc; color: #475569; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; }
  .schema-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .schema-table tr:last-child td { border-bottom: none; }
  .schema-table .field-name { font-family: monospace; color: #7c3aed; font-weight: 600; }
  .schema-table .field-type { color: #0f766e; font-size: 12px; }
  .schema-table .req { background: #fef2f2; color: #b91c1c; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; vertical-align: middle; }
  .schema-table .opt { background: #f0fdf4; color: #15803d; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; vertical-align: middle; }

  /* Curl block */
  .curl-comment { color: #94a3b8; }
  .curl-flag { color: #fbbf24; }
  .curl-url { color: #34d399; }
  .curl-str { color: #86efac; }
  .curl-kw { color: #60a5fa; }

  /* Tab nav */
  .tabs { display: flex; gap: 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; }
  .tab { padding: 8px 16px; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; border-radius: 6px 6px 0 0; user-select: none; }
  .tab.active { color: #2563eb; border-bottom-color: #2563eb; background: #eff6ff; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
</style>
</head>
<body>

<div class="header">
  <div class="container">
    <div>
      <div class="header-title">ProcureFlow Public API</div>
      <div class="header-sub">Dokumentasi integrasi untuk sistem ERP / WMS eksternal</div>
    </div>
    <span class="version-badge">v1</span>
  </div>
</div>

<div class="container">

  <!-- Authentication -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">🔐 Autentikasi</div>
    </div>
    <div class="card-body">
      <div class="auth-grid">
        <div class="auth-item">
          <div class="auth-item-label">Metode</div>
          <div class="auth-item-value">API Key</div>
        </div>
        <div class="auth-item">
          <div class="auth-item-label">Header Utama</div>
          <div class="auth-item-value"><code>X-API-Key: pf_xxx...</code></div>
        </div>
        <div class="auth-item">
          <div class="auth-item-label">Alternatif</div>
          <div class="auth-item-value"><code>Authorization: Bearer pf_xxx...</code></div>
        </div>
        <div class="auth-item">
          <div class="auth-item-label">Format Kunci</div>
          <div class="auth-item-value"><code>pf_</code> + 48 karakter hex</div>
        </div>
      </div>
      <div class="note">
        <strong>Cara mendapatkan API Key:</strong> Login ke sistem ProcureFlow sebagai Admin → buka <strong>Settings → API Keys</strong> → klik <strong>Buat API Key Baru</strong>. Salin kunci yang muncul (hanya tampil sekali).
      </div>
    </div>
  </div>

  <!-- Base URL -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">🌐 Base URL</div>
    </div>
    <div class="card-body">
      <div class="code-block"><span class="kw">Production:</span>  <span class="str">https://portal.arenacorp.com/api/v1</span>
<span class="kw">Development:</span> <span class="str">http://localhost:8080/api/v1</span></div>
      <p style="margin-top:12px;font-size:13px;color:#64748b">Semua endpoint di bawah ini adalah path relatif terhadap Base URL.</p>
    </div>
  </div>

  <!-- Endpoints -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📋 Daftar Endpoint</div>
    </div>
    <div class="card-body">

      <!-- UoM -->
      <div class="endpoint-group">
        <div class="group-title">Satuan (UoM)</div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/uoms</div>
            <div class="endpoint-desc">Ambil semua Satuan aktif</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/uoms/<span class="param">{code}</span></div>
            <div class="endpoint-desc">Ambil satu Satuan berdasarkan kode</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/uoms</div>
            <div class="endpoint-desc">Tambah atau perbarui 1 Satuan (upsert by code)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/uoms/bulk</div>
            <div class="endpoint-desc">Tambah atau perbarui banyak Satuan sekaligus (maks 500)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-DELETE">DEL</span>
          <div>
            <div class="endpoint-path">/uoms/<span class="param">{code}</span></div>
            <div class="endpoint-desc">Nonaktifkan Satuan (soft delete)</div>
          </div>
        </div>
      </div>

      <!-- Items -->
      <div class="endpoint-group">
        <div class="group-title">Item / Barang</div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/items</div>
            <div class="endpoint-desc">Ambil semua Item aktif</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/items/<span class="param">{code}</span></div>
            <div class="endpoint-desc">Ambil satu Item berdasarkan kode</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/items</div>
            <div class="endpoint-desc">Tambah atau perbarui 1 Item (upsert by code)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/items/bulk</div>
            <div class="endpoint-desc">Tambah atau perbarui banyak Item sekaligus (maks 500)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-DELETE">DEL</span>
          <div>
            <div class="endpoint-path">/items/<span class="param">{code}</span></div>
            <div class="endpoint-desc">Nonaktifkan Item (soft delete)</div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- Schema UoM -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📐 Schema: Satuan (UoM)</div>
    </div>
    <div class="card-body">
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">code</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Kode unik satuan. Contoh: <code>PCS</code>, <code>KG</code>, <code>LTR</code>. Case-sensitive.</td></tr>
          <tr><td class="field-name">name</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Nama satuan. Contoh: <code>Pieces</code>, <code>Kilogram</code>.</td></tr>
          <tr><td class="field-name">is_active</td><td class="field-type">boolean</td><td><span class="opt">OPSIONAL</span></td><td>Default: <code>true</code>. Set <code>false</code> untuk menonaktifkan.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Schema Item -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📐 Schema: Item / Barang</div>
    </div>
    <div class="card-body">
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">code</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Kode unik item/barang. Case-sensitive.</td></tr>
          <tr><td class="field-name">name</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Nama item/barang.</td></tr>
          <tr><td class="field-name">description</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Deskripsi tambahan.</td></tr>
          <tr><td class="field-name">category</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Kategori item. Contoh: <code>Hardware</code>, <code>Material</code>.</td></tr>
          <tr><td class="field-name">default_uom_code</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Kode UoM default. Harus sudah ada di master Satuan dan statusnya aktif.</td></tr>
          <tr><td class="field-name">is_active</td><td class="field-type">boolean</td><td><span class="opt">OPSIONAL</span></td><td>Default: <code>true</code>.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Examples -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">💡 Contoh Penggunaan</div>
    </div>
    <div class="card-body">

      <div style="margin-bottom:28px">
        <div class="section-label">1. Ambil semua Satuan</div>
        <div class="code-block"><span class="curl-comment"># curl</span>
curl <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/uoms</span>

<span class="curl-comment"># Response</span>
{
  <span class="key">"success"</span>: <span class="num">true</span>,
  <span class="key">"count"</span>: <span class="num">3</span>,
  <span class="key">"data"</span>: [
    { <span class="key">"id"</span>: <span class="num">1</span>, <span class="key">"code"</span>: <span class="str">"PCS"</span>, <span class="key">"name"</span>: <span class="str">"Pieces"</span>, <span class="key">"is_active"</span>: <span class="num">true</span> },
    { <span class="key">"id"</span>: <span class="num">2</span>, <span class="key">"code"</span>: <span class="str">"KG"</span>,  <span class="key">"name"</span>: <span class="str">"Kilogram"</span>, <span class="key">"is_active"</span>: <span class="num">true</span> }
  ]
}</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">2. Tambah / Update 1 Satuan</div>
        <div class="code-block">curl <span class="curl-flag">-X POST</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{"code":"BOX","name":"Box"}'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/uoms</span>

<span class="curl-comment"># Response (created)</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"created"</span>, <span class="key">"data"</span>: { <span class="key">"code"</span>: <span class="str">"BOX"</span>, ... } }

<span class="curl-comment"># Response (updated)</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"updated"</span>, <span class="key">"data"</span>: { <span class="key">"code"</span>: <span class="str">"BOX"</span>, ... } }</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">3. Bulk Import Item (dari ERP/WMS)</div>
        <div class="code-block">curl <span class="curl-flag">-X POST</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{
       "data": [
         { "code": "ITM001", "name": "Baut M8", "category": "Hardware", "default_uom_code": "PCS" },
         { "code": "ITM002", "name": "Cat Tembok 5kg", "category": "Material", "default_uom_code": "KLG" },
         { "code": "ITM003", "name": "Kabel NYA 1.5mm", "category": "Elektrikal", "default_uom_code": "MTR" }
       ]
     }'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/items/bulk</span>

<span class="curl-comment"># Response</span>
{
  <span class="key">"success"</span>: <span class="num">true</span>,
  <span class="key">"total"</span>: <span class="num">3</span>,
  <span class="key">"succeeded"</span>: <span class="num">3</span>,
  <span class="key">"failed"</span>: <span class="num">0</span>
}</div>
      </div>

      <div>
        <div class="section-label">4. Nonaktifkan Item</div>
        <div class="code-block">curl <span class="curl-flag">-X DELETE</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/items/ITM003</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"message"</span>: <span class="str">"Item 'ITM003' dinonaktifkan."</span> }</div>
      </div>

    </div>
  </div>

  <!-- Response codes -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">⚡ HTTP Status Codes</div>
    </div>
    <div class="card-body">
      <table class="schema-table">
        <thead><tr><th>Kode</th><th>Arti</th></tr></thead>
        <tbody>
          <tr><td class="field-name" style="color:#15803d">200</td><td>Berhasil</td></tr>
          <tr><td class="field-name" style="color:#b45309">400</td><td>Request tidak valid — field wajib kosong, format salah, atau UoM tidak ditemukan</td></tr>
          <tr><td class="field-name" style="color:#b91c1c">401</td><td>Unauthorized — API Key tidak ada, tidak valid, atau sudah dinonaktifkan</td></tr>
          <tr><td class="field-name" style="color:#b91c1c">404</td><td>Data tidak ditemukan</td></tr>
          <tr><td class="field-name" style="color:#7c3aed">500</td><td>Internal server error</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Notes -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📝 Catatan Penting</div>
    </div>
    <div class="card-body">
      <ul style="padding-left:20px;font-size:14px;color:#475569;display:flex;flex-direction:column;gap:8px">
        <li>Semua operasi <strong>POST menggunakan upsert</strong> — insert jika kode belum ada, update jika sudah ada.</li>
        <li><strong>Kode (code) bersifat case-sensitive</strong> dan harus unik. <code>PCS</code> dan <code>pcs</code> dianggap berbeda.</li>
        <li>Bulk endpoint menerima <strong>array di field <code>data</code></strong>. Maksimal <strong>500 item</strong> per request.</li>
        <li>DELETE hanya <strong>menonaktifkan</strong> (soft delete) — data tetap tersimpan dengan <code>is_active: false</code>.</li>
        <li>Respons error bulk tetap <code>200</code> dengan detail per baris di field <code>errors</code>.</li>
      </ul>
    </div>
  </div>

</div>
</body>
</html>`);
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
