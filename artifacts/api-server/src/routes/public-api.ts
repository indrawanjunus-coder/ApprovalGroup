import { Router, Request, Response, NextFunction } from "express";
import { db } from "../lib/db.js";
import { apiKeysTable, masterItemsTable, masterUomsTable, vendorCompaniesTable, externalPurchaseOrdersTable, externalPoItemsTable } from "@workspace/db/schema";
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
    purchase_orders: {
      "GET /api/v1/pos": "Ambil semua Purchase Order (opsional filter ?vendor_email=&status=)",
      "GET /api/v1/pos/:po_number": "Ambil detail PO beserta item-itemnya",
      "POST /api/v1/pos": "Buat atau perbarui PO beserta items (upsert by po_number)",
      "DELETE /api/v1/pos/:po_number": "Tutup PO (set status = closed)",
    },
    vendors: {
      "GET /api/v1/vendors": "Ambil semua Vendor (opsional filter ?status=&search=&limit=&offset=)",
      "GET /api/v1/vendors/:email": "Ambil detail Vendor berdasarkan email",
      "POST /api/v1/vendors": "Buat atau perbarui Vendor (upsert by email)",
      "PUT /api/v1/vendors/:email": "Perbarui sebagian data Vendor",
      "DELETE /api/v1/vendors/:email": "Suspend Vendor (set status = suspended)",
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

      <!-- Purchase Orders -->
      <div class="endpoint-group">
        <div class="group-title">Purchase Order (PO)</div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/pos</div>
            <div class="endpoint-desc">Ambil semua PO — filter opsional: <code>?vendor_email=&amp;status=</code></div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/pos/<span class="param">{po_number}</span></div>
            <div class="endpoint-desc">Ambil detail PO beserta seluruh item-nya</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/pos</div>
            <div class="endpoint-desc">Buat atau perbarui PO beserta items (upsert by <code>po_number</code>)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-DELETE">DEL</span>
          <div>
            <div class="endpoint-path">/pos/<span class="param">{po_number}</span></div>
            <div class="endpoint-desc">Tutup PO — status berubah ke <code>closed</code></div>
          </div>
        </div>
      </div>

      <!-- Vendors -->
      <div class="endpoint-group">
        <div class="group-title">Vendor</div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/vendors</div>
            <div class="endpoint-desc">Ambil semua Vendor — filter: <code>?status=&amp;search=&amp;limit=&amp;offset=</code></div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-GET">GET</span>
          <div>
            <div class="endpoint-path">/vendors/<span class="param">{email}</span></div>
            <div class="endpoint-desc">Ambil detail Vendor berdasarkan email</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-POST">POST</span>
          <div>
            <div class="endpoint-path">/vendors</div>
            <div class="endpoint-desc">Buat atau perbarui Vendor (upsert by <code>email</code>)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-PUT" style="background:#fef3c7;color:#b45309">PUT</span>
          <div>
            <div class="endpoint-path">/vendors/<span class="param">{email}</span></div>
            <div class="endpoint-desc">Perbarui sebagian field Vendor (partial update)</div>
          </div>
        </div>
        <div class="endpoint-row">
          <span class="badge badge-DELETE">DEL</span>
          <div>
            <div class="endpoint-path">/vendors/<span class="param">{email}</span></div>
            <div class="endpoint-desc">Suspend Vendor — status berubah ke <code>suspended</code></div>
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

  <!-- Schema PO -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📐 Schema: Purchase Order (PO)</div>
    </div>
    <div class="card-body">
      <p style="font-size:13px;color:#64748b;margin-bottom:14px">Body untuk <code>POST /api/v1/pos</code></p>
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">po_number</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Nomor PO unik. Digunakan sebagai kunci upsert. Contoh: <code>PO-2024-001</code></td></tr>
          <tr><td class="field-name">vendor_email</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Email vendor yang terdaftar di sistem. Digunakan untuk mencari ID vendor.</td></tr>
          <tr><td class="field-name">notes</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Catatan atau keterangan tambahan untuk PO.</td></tr>
          <tr><td class="field-name">items</td><td class="field-type">array</td><td><span class="req">WAJIB</span></td><td>Minimal 1 item. Lihat schema Item PO di bawah.</td></tr>
        </tbody>
      </table>

      <p style="font-size:13px;color:#64748b;margin:18px 0 10px;font-weight:600">Schema Item dalam PO (<code>items[]</code>)</p>
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Status</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">item_code</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Kode barang. Jika ada di master item akan di-link otomatis.</td></tr>
          <tr><td class="field-name">item_name</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Nama barang.</td></tr>
          <tr><td class="field-name">uom_code</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Kode satuan. Contoh: <code>PCS</code>, <code>KG</code>. Jika ada di master UoM akan di-link otomatis.</td></tr>
          <tr><td class="field-name">uom_name</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Nama satuan. Jika kosong dan uom_code ada di master, nama master akan digunakan.</td></tr>
          <tr><td class="field-name">qty</td><td class="field-type">number</td><td><span class="req">WAJIB</span></td><td>Kuantitas barang. Harus lebih dari 0.</td></tr>
          <tr><td class="field-name">unit_price</td><td class="field-type">number</td><td><span class="req">WAJIB</span></td><td>Harga satuan (dalam Rupiah). Harus lebih dari 0.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Examples PO -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">💡 Contoh Penggunaan — Purchase Order</div>
    </div>
    <div class="card-body">

      <div style="margin-bottom:28px">
        <div class="section-label">1. Buat PO Baru dengan Items</div>
        <div class="code-block">curl <span class="curl-flag">-X POST</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{
  "po_number":    "PO-2024-001",
  "vendor_email": "supplier@ptcontoh.com",
  "notes":        "Pengiriman ke gudang A",
  "items": [
    {
      "item_code":  "ITM001",
      "item_name":  "Baut M8 x 20mm",
      "uom_code":   "PCS",
      "qty":        500,
      "unit_price": 350
    },
    {
      "item_code":  "ITM002",
      "item_name":  "Mur M8",
      "uom_code":   "PCS",
      "qty":        500,
      "unit_price": 200
    }
  ]
}'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/pos</span>

<span class="curl-comment"># Response (created)</span>
{
  <span class="key">"success"</span>: <span class="num">true</span>,
  <span class="key">"action"</span>:  <span class="str">"created"</span>,
  <span class="key">"data"</span>: {
    <span class="key">"id"</span>:             <span class="num">42</span>,
    <span class="key">"po_number"</span>:     <span class="str">"PO-2024-001"</span>,
    <span class="key">"vendor_email"</span>:  <span class="str">"supplier@ptcontoh.com"</span>,
    <span class="key">"vendor_name"</span>:   <span class="str">"PT Contoh Supplier"</span>,
    <span class="key">"status"</span>:        <span class="str">"active"</span>,
    <span class="key">"notes"</span>:         <span class="str">"Pengiriman ke gudang A"</span>,
    <span class="key">"total_value"</span>:   <span class="num">275000</span>,
    <span class="key">"created_at"</span>:    <span class="num">1712000000000</span>,
    <span class="key">"items"</span>: [
      { <span class="key">"item_code"</span>: <span class="str">"ITM001"</span>, <span class="key">"item_name"</span>: <span class="str">"Baut M8 x 20mm"</span>, <span class="key">"uom_code"</span>: <span class="str">"PCS"</span>, <span class="key">"qty"</span>: <span class="str">"500"</span>, <span class="key">"unit_price"</span>: <span class="str">"350.00"</span>, <span class="key">"subtotal"</span>: <span class="str">"175000.00"</span> },
      { <span class="key">"item_code"</span>: <span class="str">"ITM002"</span>, <span class="key">"item_name"</span>: <span class="str">"Mur M8"</span>,       <span class="key">"uom_code"</span>: <span class="str">"PCS"</span>, <span class="key">"qty"</span>: <span class="str">"500"</span>, <span class="key">"unit_price"</span>: <span class="str">"200.00"</span>, <span class="key">"subtotal"</span>: <span class="str">"100000.00"</span> }
    ]
  }
}</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">2. Update PO (upsert — ganti items)</div>
        <div class="code-block"><span class="curl-comment"># Kirim ulang dengan po_number yang sama → items lama dihapus, diganti yang baru</span>
curl <span class="curl-flag">-X POST</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{
  "po_number":    "PO-2024-001",
  "vendor_email": "supplier@ptcontoh.com",
  "items": [
    { "item_code": "ITM001", "item_name": "Baut M8 x 20mm", "uom_code": "PCS", "qty": 600, "unit_price": 350 }
  ]
}'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/pos</span>

<span class="curl-comment"># Response (updated)</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"updated"</span>, <span class="key">"data"</span>: { <span class="key">"po_number"</span>: <span class="str">"PO-2024-001"</span>, <span class="key">"total_value"</span>: <span class="num">210000</span>, ... } }</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">3. Ambil Detail PO</div>
        <div class="code-block">curl <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/pos/PO-2024-001</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"data"</span>: { <span class="key">"po_number"</span>: <span class="str">"PO-2024-001"</span>, <span class="key">"status"</span>: <span class="str">"active"</span>, <span class="key">"items"</span>: [...] } }</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">4. List PO per Vendor</div>
        <div class="code-block">curl <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">"https://portal.arenacorp.com/api/v1/pos?vendor_email=supplier@ptcontoh.com&amp;status=active"</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"count"</span>: <span class="num">2</span>, <span class="key">"data"</span>: [ { <span class="key">"po_number"</span>: <span class="str">"PO-2024-001"</span>, ... }, ... ] }</div>
      </div>

      <div>
        <div class="section-label">5. Tutup PO</div>
        <div class="code-block">curl <span class="curl-flag">-X DELETE</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/pos/PO-2024-001</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"message"</span>: <span class="str">"PO 'PO-2024-001' telah ditutup."</span> }</div>
      </div>

    </div>
  </div>

  <!-- Schema Vendor -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">📐 Schema: Vendor</div>
    </div>
    <div class="card-body">
      <p style="font-size:13px;color:#64748b;margin-bottom:14px">Body untuk <code>POST /api/v1/vendors</code> dan <code>PUT /api/v1/vendors/:email</code></p>
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Status (POST)</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">email</td><td class="field-type">string</td><td><span class="req">WAJIB</span></td><td>Email unik vendor. Digunakan sebagai kunci upsert. Contoh: <code>supplier@ptcontoh.com</code></td></tr>
          <tr><td class="field-name">company_name</td><td class="field-type">string</td><td><span class="req">WAJIB (baru)</span></td><td>Nama perusahaan vendor. Wajib saat membuat vendor baru.</td></tr>
          <tr><td class="field-name">company_address</td><td class="field-type">string</td><td><span class="req">WAJIB (baru)</span></td><td>Alamat lengkap perusahaan. Wajib saat membuat vendor baru.</td></tr>
          <tr><td class="field-name">pic_name</td><td class="field-type">string</td><td><span class="req">WAJIB (baru)</span></td><td>Nama Person in Charge (PIC). Wajib saat membuat vendor baru.</td></tr>
          <tr><td class="field-name">pic_phone</td><td class="field-type">string</td><td><span class="req">WAJIB (baru)</span></td><td>Nomor telepon PIC. Wajib saat membuat vendor baru.</td></tr>
          <tr><td class="field-name">office_phone</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Nomor telepon kantor.</td></tr>
          <tr><td class="field-name">bank_name</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Nama bank. Contoh: <code>BCA</code>, <code>Mandiri</code>.</td></tr>
          <tr><td class="field-name">bank_account</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Nomor rekening bank.</td></tr>
          <tr><td class="field-name">bank_account_name</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Nama pemilik rekening sesuai buku tabungan.</td></tr>
          <tr><td class="field-name">password</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Password untuk login ke portal vendor. Jika tidak diisi saat buat baru, sistem akan generate otomatis.</td></tr>
          <tr><td class="field-name">status</td><td class="field-type">string</td><td><span class="opt">OPSIONAL</span></td><td>Status vendor. Pilihan: <code>pending</code> | <code>active</code> | <code>suspended</code> | <code>rejected</code>. Default saat buat baru: <code>active</code>.</td></tr>
        </tbody>
      </table>

      <p style="font-size:13px;color:#64748b;margin:18px 0 10px;font-weight:600">Field dalam Response (<code>GET</code>)</p>
      <table class="schema-table">
        <thead><tr><th>Field</th><th>Tipe</th><th>Keterangan</th></tr></thead>
        <tbody>
          <tr><td class="field-name">id</td><td class="field-type">number</td><td>ID internal vendor di sistem</td></tr>
          <tr><td class="field-name">email</td><td class="field-type">string</td><td>Email vendor</td></tr>
          <tr><td class="field-name">company_name</td><td class="field-type">string</td><td>Nama perusahaan</td></tr>
          <tr><td class="field-name">company_address</td><td class="field-type">string</td><td>Alamat perusahaan</td></tr>
          <tr><td class="field-name">pic_name</td><td class="field-type">string</td><td>Nama PIC</td></tr>
          <tr><td class="field-name">pic_phone</td><td class="field-type">string</td><td>Telepon PIC</td></tr>
          <tr><td class="field-name">office_phone</td><td class="field-type">string|null</td><td>Telepon kantor</td></tr>
          <tr><td class="field-name">bank_name</td><td class="field-type">string|null</td><td>Nama bank</td></tr>
          <tr><td class="field-name">bank_account</td><td class="field-type">string|null</td><td>Nomor rekening</td></tr>
          <tr><td class="field-name">bank_account_name</td><td class="field-type">string|null</td><td>Nama pemilik rekening</td></tr>
          <tr><td class="field-name">status</td><td class="field-type">string</td><td><code>pending</code> | <code>active</code> | <code>suspended</code> | <code>rejected</code></td></tr>
          <tr><td class="field-name">created_at</td><td class="field-type">number</td><td>Timestamp Unix (ms) saat vendor dibuat</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Examples Vendor -->
  <div class="card">
    <div class="card-header" style="background:#f8fafc">
      <div class="card-title">💡 Contoh Penggunaan — Vendor</div>
    </div>
    <div class="card-body">

      <div style="margin-bottom:28px">
        <div class="section-label">1. Daftar semua Vendor aktif</div>
        <div class="code-block">curl <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">"https://portal.arenacorp.com/api/v1/vendors?status=active"</span>

<span class="curl-comment"># Response</span>
{
  <span class="key">"success"</span>: <span class="num">true</span>,
  <span class="key">"total"</span>: <span class="num">2</span>, <span class="key">"count"</span>: <span class="num">2</span>,
  <span class="key">"data"</span>: [
    {
      <span class="key">"id"</span>: <span class="num">1</span>, <span class="key">"email"</span>: <span class="str">"supplier@ptcontoh.com"</span>,
      <span class="key">"company_name"</span>: <span class="str">"PT Contoh Supplier"</span>,
      <span class="key">"pic_name"</span>: <span class="str">"Budi Santoso"</span>, <span class="key">"status"</span>: <span class="str">"active"</span>
    }
  ]
}</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">2. Buat Vendor Baru (dari ERP)</div>
        <div class="code-block">curl <span class="curl-flag">-X POST</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{
       "email":            "vendor@ptbaru.com",
       "company_name":     "PT Baru Supplier",
       "company_address":  "Jl. Industri No.12, Jakarta",
       "pic_name":         "Siti Rahayu",
       "pic_phone":        "081234567890",
       "office_phone":     "021-5550001",
       "bank_name":        "BCA",
       "bank_account":     "1234567890",
       "bank_account_name":"PT Baru Supplier",
       "password":         "SecurePass123",
       "status":           "active"
     }'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/vendors</span>

<span class="curl-comment"># Response (201 Created)</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"created"</span>, <span class="key">"data"</span>: { <span class="key">"id"</span>: <span class="num">5</span>, <span class="key">"email"</span>: <span class="str">"vendor@ptbaru.com"</span>, ... } }</div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">3. Update Data Bank Vendor</div>
        <div class="code-block">curl <span class="curl-flag">-X PUT</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{"bank_name":"Mandiri","bank_account":"9876543210","bank_account_name":"PT Baru Supplier"}'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"updated"</span>, <span class="key">"data"</span>: { ... } }

<span class="curl-comment"># Catatan: email di URL harus di-encode: @ → %40</span></div>
      </div>

      <div style="margin-bottom:28px">
        <div class="section-label">4. Ubah Status Vendor menjadi Active</div>
        <div class="code-block">curl <span class="curl-flag">-X PUT</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"Content-Type: application/json"</span> \\
     <span class="curl-flag">-d</span> <span class="curl-str">'{"status":"active"}'</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"action"</span>: <span class="str">"updated"</span>, <span class="key">"data"</span>: { <span class="key">"status"</span>: <span class="str">"active"</span>, ... } }</div>
      </div>

      <div>
        <div class="section-label">5. Suspend Vendor</div>
        <div class="code-block">curl <span class="curl-flag">-X DELETE</span> \\
     <span class="curl-flag">-H</span> <span class="curl-str">"X-API-Key: pf_xxxxxxxxxx"</span> \\
     <span class="curl-url">https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com</span>

<span class="curl-comment"># Response</span>
{ <span class="key">"success"</span>: <span class="num">true</span>, <span class="key">"message"</span>: <span class="str">"Vendor 'vendor@ptbaru.com' berhasil di-suspend."</span> }</div>
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

// ─── Purchase Order Endpoints ─────────────────────────────────────────────

router.get("/pos", requireApiKey, async (req, res) => {
  try {
    const { vendor_email, status } = req.query as { vendor_email?: string; status?: string };
    let vendorId: number | null = null;
    if (vendor_email) {
      const [v] = await db.select({ id: vendorCompaniesTable.id })
        .from(vendorCompaniesTable).where(eq(vendorCompaniesTable.email, vendor_email));
      if (!v) return res.status(404).json({ error: "Vendor tidak ditemukan.", vendor_email });
      vendorId = v.id;
    }

    let q = db.select().from(externalPurchaseOrdersTable).$dynamic();
    const conditions: any[] = [];
    if (vendorId) conditions.push(eq(externalPurchaseOrdersTable.vendorCompanyId, vendorId));
    if (status) conditions.push(eq(externalPurchaseOrdersTable.status, status));
    if (conditions.length) q = q.where(and(...conditions));

    const pos = await q.orderBy(externalPurchaseOrdersTable.createdAt);
    const vendorIds = [...new Set(pos.map(p => p.vendorCompanyId))];
    const vendors = vendorIds.length > 0
      ? await db.select({ id: vendorCompaniesTable.id, companyName: vendorCompaniesTable.companyName, email: vendorCompaniesTable.email })
          .from(vendorCompaniesTable)
      : [];
    const vMap = Object.fromEntries(vendors.map(v => [v.id, { name: v.companyName, email: v.email }]));

    const data = await Promise.all(pos.map(p => formatPo(p, vMap[p.vendorCompanyId], false)));
    res.json({ success: true, count: data.length, data });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get("/pos/:po_number", requireApiKey, async (req, res) => {
  try {
    const poNumber = req.params.po_number;
    const [po] = await db.select().from(externalPurchaseOrdersTable)
      .where(eq(externalPurchaseOrdersTable.poNumber, poNumber));
    if (!po) return res.status(404).json({ error: "PO tidak ditemukan.", po_number: poNumber });
    const [vendor] = await db.select({ companyName: vendorCompaniesTable.companyName, email: vendorCompaniesTable.email })
      .from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, po.vendorCompanyId));
    res.json({ success: true, data: await formatPo(po, vendor, true) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post("/pos", requireApiKey, async (req, res) => {
  const result = await upsertPo(req.body);
  res.status(result.error ? (result.statusCode || 400) : 200).json(result);
});

router.delete("/pos/:po_number", requireApiKey, async (req, res) => {
  try {
    const poNumber = req.params.po_number;
    const [updated] = await db.update(externalPurchaseOrdersTable)
      .set({ status: "closed", updatedAt: Date.now() })
      .where(eq(externalPurchaseOrdersTable.poNumber, poNumber))
      .returning();
    if (!updated) return res.status(404).json({ error: "PO tidak ditemukan.", po_number: poNumber });
    res.json({ success: true, message: `PO '${poNumber}' telah ditutup.` });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Vendor Endpoints ─────────────────────────────────────────────────────

function hashVendorPassword(pw: string): string {
  return crypto.createHash("sha256").update(`pr_po_salt_2024${pw}`).digest("hex");
}

function formatVendor(v: typeof vendorCompaniesTable.$inferSelect) {
  return {
    id: v.id,
    email: v.email,
    company_name: v.companyName,
    company_address: v.companyAddress,
    pic_name: v.picName,
    pic_phone: v.picPhone,
    office_phone: v.officePhone || null,
    bank_name: v.bankName || null,
    bank_account: v.bankAccount || null,
    bank_account_name: v.bankAccountName || null,
    status: v.status,
    created_at: v.createdAt,
  };
}

// GET /api/v1/vendors
router.get("/vendors", requireApiKey, async (req, res) => {
  try {
    const { status, search, limit = "100", offset = "0" } = req.query as any;
    let rows = await db.select().from(vendorCompaniesTable);
    if (status) rows = rows.filter(v => v.status === status);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(v =>
        v.companyName.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q) ||
        v.picName.toLowerCase().includes(q)
      );
    }
    const total = rows.length;
    const data = rows.slice(Number(offset), Number(offset) + Number(limit)).map(formatVendor);
    res.json({ success: true, total, count: data.length, data });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/v1/vendors/:email
router.get("/vendors/:email", requireApiKey, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const [v] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.email, email));
    if (!v) { res.status(404).json({ success: false, error: `Vendor dengan email '${email}' tidak ditemukan.` }); return; }
    res.json({ success: true, data: formatVendor(v) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/v1/vendors (upsert by email)
router.post("/vendors", requireApiKey, async (req, res) => {
  try {
    const {
      email, company_name, company_address, pic_name, pic_phone,
      office_phone, bank_name, bank_account, bank_account_name,
      password, status,
    } = req.body;

    if (!email) { res.status(400).json({ success: false, error: "'email' wajib diisi." }); return; }
    const normalEmail = String(email).toLowerCase().trim();

    const [existing] = await db.select().from(vendorCompaniesTable)
      .where(eq(vendorCompaniesTable.email, normalEmail));

    const allowedStatuses = ["pending", "active", "suspended", "rejected"];
    if (status && !allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, error: `Status tidak valid. Pilihan: ${allowedStatuses.join(", ")}.` }); return;
    }

    if (existing) {
      // Update existing vendor
      const updateData: any = { };
      if (company_name !== undefined) updateData.companyName = company_name;
      if (company_address !== undefined) updateData.companyAddress = company_address;
      if (pic_name !== undefined) updateData.picName = pic_name;
      if (pic_phone !== undefined) updateData.picPhone = pic_phone;
      if (office_phone !== undefined) updateData.officePhone = office_phone;
      if (bank_name !== undefined) updateData.bankName = bank_name;
      if (bank_account !== undefined) updateData.bankAccount = bank_account;
      if (bank_account_name !== undefined) updateData.bankAccountName = bank_account_name;
      if (password) updateData.passwordHash = hashVendorPassword(password);
      if (status) updateData.status = status;

      const [updated] = await db.update(vendorCompaniesTable).set(updateData)
        .where(eq(vendorCompaniesTable.email, normalEmail)).returning();
      res.json({ success: true, action: "updated", data: formatVendor(updated) });
    } else {
      // Create new vendor
      if (!company_name) { res.status(400).json({ success: false, error: "'company_name' wajib diisi saat membuat vendor baru." }); return; }
      if (!company_address) { res.status(400).json({ success: false, error: "'company_address' wajib diisi saat membuat vendor baru." }); return; }
      if (!pic_name) { res.status(400).json({ success: false, error: "'pic_name' wajib diisi saat membuat vendor baru." }); return; }
      if (!pic_phone) { res.status(400).json({ success: false, error: "'pic_phone' wajib diisi saat membuat vendor baru." }); return; }

      const pw = password || crypto.randomBytes(12).toString("hex");
      const [created] = await db.insert(vendorCompaniesTable).values({
        email: normalEmail,
        companyName: company_name,
        companyAddress: company_address,
        picName: pic_name,
        picPhone: pic_phone,
        officePhone: office_phone || "",
        bankName: bank_name || null,
        bankAccount: bank_account || null,
        bankAccountName: bank_account_name || null,
        passwordHash: hashVendorPassword(pw),
        status: status || "active",
        createdAt: Date.now(),
      }).returning();
      res.status(201).json({ success: true, action: "created", data: formatVendor(created) });
    }
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/v1/vendors/:email (partial update)
router.put("/vendors/:email", requireApiKey, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const [existing] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.email, email));
    if (!existing) { res.status(404).json({ success: false, error: `Vendor '${email}' tidak ditemukan.` }); return; }

    const {
      company_name, company_address, pic_name, pic_phone, office_phone,
      bank_name, bank_account, bank_account_name, password, status,
    } = req.body;

    const allowedStatuses = ["pending", "active", "suspended", "rejected"];
    if (status && !allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, error: `Status tidak valid. Pilihan: ${allowedStatuses.join(", ")}.` }); return;
    }

    const updateData: any = {};
    if (company_name !== undefined) updateData.companyName = company_name;
    if (company_address !== undefined) updateData.companyAddress = company_address;
    if (pic_name !== undefined) updateData.picName = pic_name;
    if (pic_phone !== undefined) updateData.picPhone = pic_phone;
    if (office_phone !== undefined) updateData.officePhone = office_phone;
    if (bank_name !== undefined) updateData.bankName = bank_name;
    if (bank_account !== undefined) updateData.bankAccount = bank_account;
    if (bank_account_name !== undefined) updateData.bankAccountName = bank_account_name;
    if (password) updateData.passwordHash = hashVendorPassword(password);
    if (status) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ success: false, error: "Tidak ada field yang diperbarui." }); return;
    }

    const [updated] = await db.update(vendorCompaniesTable).set(updateData)
      .where(eq(vendorCompaniesTable.email, email)).returning();
    res.json({ success: true, action: "updated", data: formatVendor(updated) });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/v1/vendors/:email (soft delete → status: suspended)
router.delete("/vendors/:email", requireApiKey, async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const [existing] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.email, email));
    if (!existing) { res.status(404).json({ success: false, error: `Vendor '${email}' tidak ditemukan.` }); return; }
    if (existing.status === "suspended") {
      res.status(400).json({ success: false, error: `Vendor '${email}' sudah dalam status suspended.` }); return;
    }
    await db.update(vendorCompaniesTable).set({ status: "suspended" })
      .where(eq(vendorCompaniesTable.email, email));
    res.json({ success: true, message: `Vendor '${email}' berhasil di-suspend.` });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
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

async function formatPo(
  po: typeof externalPurchaseOrdersTable.$inferSelect,
  vendor: { name?: string; companyName?: string; email?: string } | undefined,
  withItems: boolean,
) {
  const totalValue = withItems
    ? (await db.select().from(externalPoItemsTable).where(eq(externalPoItemsTable.poId, po.id)))
        .reduce((s, i) => s + Number(i.subtotal), 0)
    : undefined;
  const base: any = {
    id: po.id,
    po_number: po.poNumber,
    vendor_email: vendor?.email ?? null,
    vendor_name: vendor?.name ?? vendor?.companyName ?? null,
    status: po.status,
    notes: po.notes,
    created_by: po.createdBy,
    created_at: po.createdAt,
    updated_at: po.updatedAt,
  };
  if (totalValue !== undefined) base.total_value = totalValue;
  if (withItems) {
    const items = await db.select().from(externalPoItemsTable).where(eq(externalPoItemsTable.poId, po.id));
    base.items = items.map(it => ({
      item_code: it.itemCode, item_name: it.itemName,
      uom_code: it.uomCode, uom_name: it.uomName,
      qty: it.qty, unit_price: it.unitPrice, subtotal: it.subtotal,
    }));
  }
  return base;
}

async function upsertPo(data: any): Promise<any> {
  const poNumber = (data?.po_number || "").trim();
  const vendorEmail = (data?.vendor_email || "").trim();
  if (!poNumber) return { error: "Field 'po_number' wajib diisi." };
  if (!vendorEmail) return { error: "Field 'vendor_email' wajib diisi." };
  if (!Array.isArray(data?.items) || data.items.length === 0) {
    return { error: "Field 'items' wajib berupa array minimal 1 elemen." };
  }

  // Validate all items
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    if (!it.item_code || !it.item_name) return { error: `items[${i}]: 'item_code' dan 'item_name' wajib diisi.` };
    if (!it.uom_code) return { error: `items[${i}]: 'uom_code' wajib diisi.` };
    if (!it.qty || Number(it.qty) <= 0) return { error: `items[${i}]: 'qty' harus lebih dari 0.` };
    if (!it.unit_price || Number(it.unit_price) <= 0) return { error: `items[${i}]: 'unit_price' harus lebih dari 0.` };
  }

  // Lookup vendor
  const [vendor] = await db.select().from(vendorCompaniesTable)
    .where(eq(vendorCompaniesTable.email, vendorEmail));
  if (!vendor) return { statusCode: 404, error: `Vendor dengan email '${vendorEmail}' tidak ditemukan di sistem.` };

  // Resolve item IDs and UoM IDs from master (optional, best effort)
  const itemCodes = data.items.map((it: any) => it.item_code);
  const uomCodes  = data.items.map((it: any) => it.uom_code);
  const [masterItems, masterUoms] = await Promise.all([
    db.select().from(masterItemsTable).where(inArray(masterItemsTable.code, itemCodes)),
    db.select().from(masterUomsTable).where(inArray(masterUomsTable.code, uomCodes)),
  ]);
  const itemMap = Object.fromEntries(masterItems.map(i => [i.code, i]));
  const uomMap  = Object.fromEntries(masterUoms.map(u => [u.code, u]));

  const now = Date.now();
  try {
    // Check if PO exists
    const [existing] = await db.select().from(externalPurchaseOrdersTable)
      .where(eq(externalPurchaseOrdersTable.poNumber, poNumber));

    let po: typeof externalPurchaseOrdersTable.$inferSelect;
    let action: "created" | "updated";

    if (existing) {
      if (existing.status === "closed") {
        return { statusCode: 400, error: `PO '${poNumber}' sudah ditutup dan tidak dapat diubah.` };
      }
      [po] = await db.update(externalPurchaseOrdersTable)
        .set({
          vendorCompanyId: vendor.id,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          updatedAt: now,
        })
        .where(eq(externalPurchaseOrdersTable.id, existing.id))
        .returning();
      // Replace all items
      await db.delete(externalPoItemsTable).where(eq(externalPoItemsTable.poId, po.id));
      action = "updated";
    } else {
      [po] = await db.insert(externalPurchaseOrdersTable).values({
        poNumber, vendorCompanyId: vendor.id, status: "active",
        notes: data.notes || null, createdBy: "api", createdAt: now, updatedAt: now,
      }).returning();
      action = "created";
    }

    // Insert items
    const itemRows = data.items.map((it: any) => {
      const masterItem = itemMap[it.item_code];
      const masterUom  = uomMap[it.uom_code];
      const qty       = String(Number(it.qty));
      const unitPrice = String(Number(it.unit_price));
      const subtotal  = String(Number(it.qty) * Number(it.unit_price));
      return {
        poId: po.id,
        itemId: masterItem?.id ?? null,
        itemCode: it.item_code, itemName: it.item_name,
        uomId: masterUom?.id ?? null,
        uomCode: it.uom_code,
        uomName: it.uom_name || masterUom?.name || it.uom_code,
        qty, unitPrice, subtotal,
      };
    });
    await db.insert(externalPoItemsTable).values(itemRows);

    const formatted = await formatPo(po, { name: vendor.companyName, email: vendor.email }, true);
    formatted.total_value = itemRows.reduce((s: number, r: any) => s + Number(r.subtotal), 0);
    return { success: true, action, data: formatted };
  } catch (err: any) {
    return { statusCode: 500, error: err.message };
  }
}

export default router;
