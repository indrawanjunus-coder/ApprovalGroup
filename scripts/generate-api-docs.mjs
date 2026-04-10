// ProcureFlow Public API Documentation Generator (Word / .docx)
// Run: node scripts/generate-api-docs.mjs

import { createRequire } from "module";
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  PageOrientation, Header, Footer, PageNumber, NumberFormat,
  TableLayoutType, convertInchesToTwip, LevelFormat,
} = require("/home/runner/workspace/node_modules/.pnpm/docx@9.6.1/node_modules/docx/dist/index.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "../ProcureFlow_API_Documentation.docx");

// ─── Colors ──────────────────────────────────────────────────────────────────
const BLUE_DARK  = "1E40AF";
const BLUE       = "2563EB";
const BLUE_LIGHT = "DBEAFE";
const GREEN      = "15803D";
const GREEN_BG   = "DCFCE7";
const RED        = "B91C1C";
const RED_BG     = "FEE2E2";
const AMBER      = "B45309";
const AMBER_BG   = "FEF3C7";
const PURPLE     = "7C3AED";
const TEAL       = "0F766E";
const SLATE      = "475569";
const SLATE_LT   = "94A3B8";
const HEADING    = "0F172A";
const BODY       = "334155";
const BORDER_CLR = "E2E8F0";
const BG         = "F8FAFC";
const CODE_BG    = "1E293B";
const CODE_FG    = "E2E8F0";
const WHITE      = "FFFFFF";

// ─── Paragraph helpers ────────────────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, bold: true, color: HEADING, size: 36 })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    children: [new TextRun({ text, bold: true, color: BLUE_DARK, size: 28 })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 60 },
    children: [new TextRun({ text, bold: true, color: SLATE, size: 24 })],
  });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, color: BODY, size: 20, ...opts })],
  });
}
function pNote(text) {
  return new Paragraph({
    spacing: { after: 100, before: 60 },
    shading: { type: ShadingType.SOLID, color: "FFFBEB" },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: "FDE68A" },
    },
    indent: { left: 120 },
    children: [new TextRun({ text: "ℹ️  " + text, color: "92400E", size: 18 })],
  });
}
function pSpacer() {
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun("")] });
}
function sectionTitle(text) {
  return new Paragraph({
    spacing: { before: 400, after: 120 },
    shading: { type: ShadingType.SOLID, color: BLUE_DARK },
    children: [new TextRun({ text: `  ${text}`, bold: true, color: WHITE, size: 26 })],
  });
}
function bulletItem(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, color: BODY, size: 19 })],
  });
}

// ─── Endpoint row ─────────────────────────────────────────────────────────────
function methodColor(method) {
  return { GET: [GREEN_BG, GREEN], POST: [BLUE_LIGHT, BLUE], PUT: [AMBER_BG, AMBER], DELETE: [RED_BG, RED] }[method] || [BG, SLATE];
}
function endpointTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: rows.map(([method, path2, desc]) => {
      const [bg, fg] = methodColor(method);
      return new TableRow({
        children: [
          new TableCell({
            width: { size: 900, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: bg },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: method, bold: true, color: fg, size: 17 })] })],
          }),
          new TableCell({
            width: { size: 3800, type: WidthType.DXA },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: path2, color: PURPLE, size: 18 })] })],
          }),
          new TableCell({
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [new Paragraph({ children: [new TextRun({ text: desc, color: BODY, size: 18 })] })],
          }),
        ],
      });
    }),
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      left:   { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      right:  { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
    },
  });
}

// ─── Schema table ─────────────────────────────────────────────────────────────
function schemaTable(rows, showStatusCol = true) {
  const headerCells = showStatusCol
    ? [["Field", 1800], ["Tipe", 1200], ["Status", 1100], ["Keterangan", null]]
    : [["Field", 1800], ["Tipe", 1500], ["Keterangan", null]];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerCells.map(([label, w]) =>
      new TableCell({
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        shading: { type: ShadingType.SOLID, color: BG },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: SLATE, size: 17 })] })],
      })
    ),
  });

  const dataRows = rows.map((row) => {
    const [field, type, ...rest] = row;
    const [status, desc] = showStatusCol ? rest : ["", rest[0]];
    const isReq = status === "WAJIB";
    const isPartialReq = status?.includes("baru");
    const statusBg = isReq ? RED_BG : isPartialReq ? AMBER_BG : GREEN_BG;
    const statusFg = isReq ? RED : isPartialReq ? AMBER : GREEN;

    const cells = [
      new TableCell({
        width: { size: 1800, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: field, color: PURPLE, size: 17 })] })],
      }),
      new TableCell({
        width: { size: showStatusCol ? 1200 : 1500, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: type, color: TEAL, size: 17 })] })],
      }),
    ];
    if (showStatusCol) {
      cells.push(new TableCell({
        width: { size: 1100, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: statusBg },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: status, bold: true, color: statusFg, size: 16 })] })],
      }));
    }
    cells.push(new TableCell({
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: desc, color: BODY, size: 17 })] })],
    }));
    return new TableRow({ children: cells });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      left:   { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      right:  { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
    },
  });
}

// ─── Code block (dark bg) ─────────────────────────────────────────────────────
function codeBlock(text) {
  const lines = text.split("\n");
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: "1E293B" },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: lines.map(line =>
              new Paragraph({
                spacing: { after: 0 },
                children: [new TextRun({ text: line, color: CODE_FG, size: 17 })],
              })
            ),
          }),
        ],
      }),
    ],
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
  });
}

// ─── Auth grid table ──────────────────────────────────────────────────────────
function authGrid() {
  const rows = [
    ["Metode", "API Key"],
    ["Header Utama", "X-API-Key: pf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
    ["Header Alternatif", "Authorization: Bearer pf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"],
    ["Format Kunci", "Diawali \"pf_\" diikuti 48 karakter hexadecimal"],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, val]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 2000, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: BG },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: SLATE, size: 18 })] })],
          }),
          new TableCell({
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: val, color: PURPLE, size: 18 })] })],
          }),
        ],
      })
    ),
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      left:   { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      right:  { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
    },
  });
}

// ─── HTTP Status table ────────────────────────────────────────────────────────
function httpStatusTable() {
  const rows = [
    ["200", GREEN,  "OK",           "Request berhasil. Data tersedia di field data."],
    ["201", GREEN,  "Created",      "Data baru berhasil dibuat (upsert action = created)."],
    ["400", AMBER,  "Bad Request",  "Request tidak valid — field wajib kosong, format salah, atau validasi gagal."],
    ["401", RED,    "Unauthorized", "API Key tidak ada, tidak valid, atau sudah dinonaktifkan."],
    ["404", RED,    "Not Found",    "Data tidak ditemukan berdasarkan kode/email/nomor yang diberikan."],
    ["500", PURPLE, "Server Error", "Internal server error. Hubungi administrator sistem."],
  ];
  const header = new TableRow({
    tableHeader: true,
    children: [["Kode", 800], ["Nama", 1800], ["Keterangan", null]].map(([label, w]) =>
      new TableCell({
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        shading: { type: ShadingType.SOLID, color: BG },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, color: SLATE, size: 17 })] })],
      })
    ),
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows.map(([code, fg, name, desc]) =>
      new TableRow({
        children: [
          new TableCell({ width: { size: 800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: code, bold: true, color: fg, size: 18 })] })] }),
          new TableCell({ width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: name, color: BODY, size: 18 })] })] }),
          new TableCell({ margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ children: [new TextRun({ text: desc, color: BODY, size: 18 })] })] }),
        ],
      })
    )],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      left:   { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      right:  { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideH:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
      insideV:{ style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR },
    },
  });
}

// ─── Cover page ───────────────────────────────────────────────────────────────
function coverPage() {
  return [
    new Paragraph({ spacing: { after: 1400 }, children: [new TextRun("")] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      shading: { type: ShadingType.SOLID, color: BLUE_DARK },
      children: [new TextRun({ text: "  ProcureFlow  ", bold: true, color: WHITE, size: 52 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      shading: { type: ShadingType.SOLID, color: BLUE },
      children: [new TextRun({ text: "  Public API v1 — Dokumentasi Integrasi ERP / WMS  ", color: "BFDBFE", size: 30 })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: "Base URL (Production)", bold: true, color: SLATE, size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "https://portal.arenacorp.com/api/v1", color: GREEN, size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Versi: v1.0  |  Diterbitkan: April 2026", color: SLATE_LT, size: 18 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Arena Corporation — DOKUMEN RAHASIA", bold: true, color: RED, size: 18 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: "Hanya untuk digunakan oleh mitra integrasi resmi ProcureFlow", color: SLATE_LT, size: 17 })] }),
    new Paragraph({ pageBreakBefore: true, children: [new TextRun("")] }),
  ];
}

// ─── Assemble document ────────────────────────────────────────────────────────
const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR } },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: "ProcureFlow  ·  Dokumentasi Public API v1", color: SLATE_LT, size: 17 }),
              new TextRun({ text: "          ", size: 17 }),
              new TextRun({ text: "Arena Corporation — RAHASIA", color: SLATE_LT, size: 17 }),
            ],
          }),
        ],
      }),
    },
    children: [
      // ── Cover ──────────────────────────────────────────────────────────────
      ...coverPage(),

      // ── 1. Autentikasi ─────────────────────────────────────────────────────
      sectionTitle("1. Informasi Umum & Autentikasi"),
      h2("1.1 Base URL"),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            new TableCell({ width: { size: 1600, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: BG }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Production", bold: true, color: SLATE, size: 18 })] })] }),
            new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "https://portal.arenacorp.com/api/v1", color: GREEN, size: 18 })] })] }),
          ]}),
          new TableRow({ children: [
            new TableCell({ shading: { type: ShadingType.SOLID, color: BG }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "Development", bold: true, color: SLATE, size: 18 })] })] }),
            new TableCell({ margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: "http://localhost:8080/api/v1", color: SLATE, size: 18 })] })] }),
          ]}),
        ],
        borders: { top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR }, bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR }, left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR }, right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR }, insideH: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR }, insideV: { style: BorderStyle.SINGLE, size: 1, color: BORDER_CLR } },
      }),
      pSpacer(),

      h2("1.2 Autentikasi — API Key"),
      p("Semua endpoint Public API menggunakan autentikasi berbasis API Key. Key dikirim melalui salah satu cara berikut:"),
      authGrid(),
      pSpacer(),
      pNote("Cara mendapatkan API Key: Login ke ProcureFlow sebagai Admin → Settings → API Keys → Buat API Key Baru. Salin kunci yang muncul (hanya ditampilkan sekali)."),

      h2("1.3 Format Response"),
      p("Semua response mengembalikan JSON dengan struktur berikut:"),
      codeBlock(
`// Response sukses
{ "success": true, "data": { ... }, "count": 10 }

// Response sukses (list)
{ "success": true, "total": 50, "count": 10, "data": [ ... ] }

// Response error
{ "success": false, "error": "Deskripsi error", "message": "Detail tambahan" }`),
      pSpacer(),

      // ── 2. Daftar Endpoint ─────────────────────────────────────────────────
      sectionTitle("2. Daftar Endpoint Ringkas"),
      h3("Master Satuan (UoM)"),
      endpointTable([
        ["GET",    "/api/v1/uoms",          "Ambil semua Satuan aktif"],
        ["GET",    "/api/v1/uoms/{code}",   "Ambil satu Satuan berdasarkan kode"],
        ["POST",   "/api/v1/uoms",          "Tambah atau perbarui 1 Satuan (upsert by code)"],
        ["POST",   "/api/v1/uoms/bulk",     "Tambah atau perbarui banyak Satuan sekaligus (maks 500)"],
        ["DELETE", "/api/v1/uoms/{code}",   "Nonaktifkan Satuan (soft delete)"],
      ]),
      pSpacer(),
      h3("Master Item / Barang"),
      endpointTable([
        ["GET",    "/api/v1/items",         "Ambil semua Item aktif"],
        ["GET",    "/api/v1/items/{code}",  "Ambil satu Item berdasarkan kode"],
        ["POST",   "/api/v1/items",         "Tambah atau perbarui 1 Item (upsert by code)"],
        ["POST",   "/api/v1/items/bulk",    "Tambah atau perbarui banyak Item sekaligus (maks 500)"],
        ["DELETE", "/api/v1/items/{code}",  "Nonaktifkan Item (soft delete)"],
      ]),
      pSpacer(),
      h3("Master Vendor"),
      endpointTable([
        ["GET",    "/api/v1/vendors",             "Ambil semua Vendor — filter: ?status=&search=&limit=&offset="],
        ["GET",    "/api/v1/vendors/{email}",     "Ambil detail Vendor berdasarkan email"],
        ["POST",   "/api/v1/vendors",             "Buat atau perbarui Vendor (upsert by email)"],
        ["PUT",    "/api/v1/vendors/{email}",     "Perbarui sebagian field Vendor (partial update)"],
        ["DELETE", "/api/v1/vendors/{email}",     "Suspend Vendor — status berubah ke suspended"],
      ]),
      pSpacer(),
      h3("Purchase Order (PO)"),
      endpointTable([
        ["GET",    "/api/v1/pos",                  "Ambil semua PO — filter opsional: ?vendor_email=&status="],
        ["GET",    "/api/v1/pos/{po_number}",      "Ambil detail PO beserta seluruh item-nya"],
        ["POST",   "/api/v1/pos",                  "Buat atau perbarui PO beserta items (upsert by po_number)"],
        ["DELETE", "/api/v1/pos/{po_number}",      "Tutup PO — status berubah ke closed"],
      ]),
      pSpacer(),

      // ── 3. Master Satuan ────────────────────────────────────────────────────
      sectionTitle("3. Master Satuan (UoM)"),
      h2("3.1 Schema Request — POST /api/v1/uoms"),
      schemaTable([
        ["code",      "string",  "WAJIB",    "Kode unik satuan. Contoh: PCS, KG, LTR, MTR. Case-sensitive."],
        ["name",      "string",  "WAJIB",    "Nama satuan. Contoh: Pieces, Kilogram, Liter, Meter."],
        ["is_active", "boolean", "OPSIONAL", "Default: true. Set false untuk menonaktifkan satuan."],
      ]),
      pSpacer(),

      h2("3.2 Contoh Penggunaan"),
      h3("Ambil semua Satuan"),
      codeBlock(
`curl -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/uoms

# Response
{
  "success": true,
  "count": 4,
  "data": [
    { "id": 1, "code": "PCS", "name": "Pieces",   "is_active": true },
    { "id": 2, "code": "KG",  "name": "Kilogram", "is_active": true },
    { "id": 3, "code": "MTR", "name": "Meter",    "is_active": true },
    { "id": 4, "code": "LTR", "name": "Liter",    "is_active": true }
  ]
}`),
      pSpacer(),

      h3("Tambah / Update 1 Satuan"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{"code":"BOX","name":"Box"}' \\
     https://portal.arenacorp.com/api/v1/uoms

# Response (created)
{ "success": true, "action": "created", "data": { "code": "BOX", "name": "Box", "is_active": true } }

# Response (updated jika BOX sudah ada)
{ "success": true, "action": "updated", "data": { "code": "BOX", "name": "Box", "is_active": true } }`),
      pSpacer(),

      h3("Bulk Import Satuan"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "data": [
         { "code": "PCS", "name": "Pieces"   },
         { "code": "KG",  "name": "Kilogram" },
         { "code": "LTR", "name": "Liter"    },
         { "code": "MTR", "name": "Meter"    },
         { "code": "BOX", "name": "Box"      }
       ]
     }' \\
     https://portal.arenacorp.com/api/v1/uoms/bulk

# Response
{ "success": true, "total": 5, "succeeded": 5, "failed": 0 }`),
      pSpacer(),

      h3("Nonaktifkan Satuan"),
      codeBlock(
`curl -X DELETE \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/uoms/BOX

# Response
{ "success": true, "message": "UoM 'BOX' dinonaktifkan." }`),
      pSpacer(),

      // ── 4. Master Item ──────────────────────────────────────────────────────
      sectionTitle("4. Master Item / Barang"),
      h2("4.1 Schema Request — POST /api/v1/items"),
      schemaTable([
        ["code",             "string",  "WAJIB",    "Kode unik item/barang. Case-sensitive. Contoh: ITM001."],
        ["name",             "string",  "WAJIB",    "Nama item/barang. Contoh: Baut M8 x 20mm."],
        ["description",      "string",  "OPSIONAL", "Deskripsi atau spesifikasi tambahan item."],
        ["category",         "string",  "OPSIONAL", "Kategori item. Contoh: Hardware, Material, Elektrikal."],
        ["default_uom_code", "string",  "OPSIONAL", "Kode UoM default. Harus ada di master Satuan dan statusnya aktif."],
        ["is_active",        "boolean", "OPSIONAL", "Default: true. Set false untuk menonaktifkan."],
      ]),
      pSpacer(),

      h2("4.2 Contoh Penggunaan"),
      h3("Tambah 1 Item"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "code":             "ITM001",
       "name":             "Baut M8 x 20mm",
       "category":         "Hardware",
       "default_uom_code": "PCS"
     }' \\
     https://portal.arenacorp.com/api/v1/items

# Response
{ "success": true, "action": "created", "data": { "code": "ITM001", "name": "Baut M8 x 20mm", ... } }`),
      pSpacer(),

      h3("Bulk Import Item dari ERP/WMS (sampai 500 item)"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "data": [
         { "code": "ITM001", "name": "Baut M8 x 20mm",      "category": "Hardware",   "default_uom_code": "PCS" },
         { "code": "ITM002", "name": "Mur M8",               "category": "Hardware",   "default_uom_code": "PCS" },
         { "code": "ITM003", "name": "Cat Tembok 5kg",        "category": "Material",   "default_uom_code": "KLG" },
         { "code": "ITM004", "name": "Kabel NYA 1.5mm",       "category": "Elektrikal", "default_uom_code": "MTR" },
         { "code": "ITM005", "name": "Thinner A Special 1L",  "category": "Material",   "default_uom_code": "LTR" }
       ]
     }' \\
     https://portal.arenacorp.com/api/v1/items/bulk

# Response sukses penuh
{ "success": true, "total": 5, "succeeded": 5, "failed": 0 }

# Response jika ada error parsial (tetap HTTP 200)
{
  "success": false,
  "total": 5, "succeeded": 4, "failed": 1,
  "errors": [{ "row": 3, "error": "UoM 'KLG' tidak ditemukan di master satuan." }]
}`),
      pSpacer(),

      h3("Nonaktifkan Item"),
      codeBlock(
`curl -X DELETE \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/items/ITM005

# Response
{ "success": true, "message": "Item 'ITM005' dinonaktifkan." }`),
      pSpacer(),

      // ── 5. Master Vendor ────────────────────────────────────────────────────
      sectionTitle("5. Master Vendor"),
      h2("5.1 Schema Request — POST /api/v1/vendors"),
      schemaTable([
        ["email",             "string",        "WAJIB",         "Email unik vendor — kunci upsert. Contoh: supplier@ptcontoh.com"],
        ["company_name",      "string",        "WAJIB (baru)",  "Nama perusahaan vendor. Wajib saat membuat vendor baru."],
        ["company_address",   "string",        "WAJIB (baru)",  "Alamat lengkap perusahaan. Wajib saat membuat vendor baru."],
        ["pic_name",          "string",        "WAJIB (baru)",  "Nama Person in Charge (PIC). Wajib saat membuat vendor baru."],
        ["pic_phone",         "string",        "WAJIB (baru)",  "Nomor telepon PIC. Wajib saat membuat vendor baru."],
        ["office_phone",      "string",        "OPSIONAL",      "Nomor telepon kantor perusahaan."],
        ["bank_name",         "string",        "OPSIONAL",      "Nama bank. Contoh: BCA, Mandiri, BNI, BRI."],
        ["bank_account",      "string",        "OPSIONAL",      "Nomor rekening bank vendor."],
        ["bank_account_name", "string",        "OPSIONAL",      "Nama pemilik rekening sesuai buku tabungan."],
        ["password",          "string",        "OPSIONAL",      "Password untuk login ke portal vendor. Jika kosong saat buat baru, sistem generate otomatis."],
        ["status",            "string",        "OPSIONAL",      "Status vendor: pending | active | suspended | rejected. Default baru: active."],
      ]),
      pSpacer(),

      h2("5.2 Schema Response — GET /api/v1/vendors"),
      schemaTable([
        ["id",               "number",      "",  "ID internal vendor di sistem"],
        ["email",            "string",      "",  "Email vendor (kunci unik)"],
        ["company_name",     "string",      "",  "Nama perusahaan"],
        ["company_address",  "string",      "",  "Alamat perusahaan"],
        ["pic_name",         "string",      "",  "Nama Person in Charge"],
        ["pic_phone",        "string",      "",  "Nomor telepon PIC"],
        ["office_phone",     "string|null", "",  "Nomor telepon kantor"],
        ["bank_name",        "string|null", "",  "Nama bank"],
        ["bank_account",     "string|null", "",  "Nomor rekening bank"],
        ["bank_account_name","string|null", "",  "Nama pemilik rekening"],
        ["status",           "string",      "",  "pending | active | suspended | rejected"],
        ["created_at",       "number",      "",  "Timestamp Unix (milliseconds) saat vendor dibuat"],
      ], false),
      pSpacer(),

      h2("5.3 Query Parameters — GET /api/v1/vendors"),
      schemaTable([
        ["status",  "string",  "OPSIONAL", "Filter berdasarkan status: pending | active | suspended | rejected"],
        ["search",  "string",  "OPSIONAL", "Pencarian berdasarkan nama perusahaan, email, atau nama PIC"],
        ["limit",   "number",  "OPSIONAL", "Jumlah data per halaman. Default: 100. Maks: 500."],
        ["offset",  "number",  "OPSIONAL", "Offset untuk paginasi. Default: 0."],
      ]),
      pSpacer(),

      h2("5.4 Contoh Penggunaan"),
      h3("Daftar semua Vendor aktif"),
      codeBlock(
`curl -H "X-API-Key: pf_xxxxxxxxxx" \\
     "https://portal.arenacorp.com/api/v1/vendors?status=active&limit=50"

# Response
{
  "success": true, "total": 2, "count": 2,
  "data": [
    {
      "id": 1, "email": "supplier@ptcontoh.com",
      "company_name": "PT Contoh Supplier",
      "pic_name": "Budi Santoso", "status": "active",
      "created_at": 1712000000000
    }
  ]
}`),
      pSpacer(),

      h3("Buat Vendor Baru (dari ERP)"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "email":             "vendor@ptbaru.com",
       "company_name":      "PT Baru Supplier",
       "company_address":   "Jl. Industri No.12, Kawasan MM2100, Bekasi",
       "pic_name":          "Siti Rahayu",
       "pic_phone":         "081234567890",
       "office_phone":      "021-5550001",
       "bank_name":         "BCA",
       "bank_account":      "1234567890",
       "bank_account_name": "PT Baru Supplier",
       "password":          "SecurePass123",
       "status":            "active"
     }' \\
     https://portal.arenacorp.com/api/v1/vendors

# Response (201 Created)
{ "success": true, "action": "created", "data": { "id": 5, "email": "vendor@ptbaru.com", ... } }`),
      pSpacer(),

      h3("Update Sebagian Data Vendor (bank / status)"),
      codeBlock(
`# Update data rekening bank
curl -X PUT \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{"bank_name":"Mandiri","bank_account":"9876543210","bank_account_name":"PT Baru Supplier"}' \\
     https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com

# Aktifkan vendor yang sebelumnya pending/suspended
curl -X PUT \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{"status":"active"}' \\
     https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com

# Catatan: email di URL harus di-encode — @ menjadi %40`),
      pSpacer(),

      h3("Suspend Vendor"),
      codeBlock(
`curl -X DELETE \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/vendors/vendor%40ptbaru.com

# Response
{ "success": true, "message": "Vendor 'vendor@ptbaru.com' berhasil di-suspend." }`),
      pSpacer(),

      // ── 6. Purchase Order ────────────────────────────────────────────────────
      sectionTitle("6. Purchase Order (PO) & Item PO"),
      p("PO dikirim dari sistem ERP/WMS ke ProcureFlow melalui API ini. Vendor dapat melihat PO-nya di portal vendor dan mengajukan invoice berdasarkan PO yang diterima."),
      pSpacer(),

      h2("6.1 Schema Request — POST /api/v1/pos"),
      schemaTable([
        ["po_number",    "string", "WAJIB",    "Nomor PO unik — kunci upsert. Contoh: PO-2024-001."],
        ["vendor_email", "string", "WAJIB",    "Email vendor yang terdaftar di sistem. Digunakan untuk mencari ID vendor."],
        ["notes",        "string", "OPSIONAL", "Catatan atau keterangan tambahan untuk PO ini."],
        ["items",        "array",  "WAJIB",    "Daftar item dalam PO. Minimal 1 item. Lihat schema items[] di bawah."],
      ]),
      pSpacer(),

      p("Schema untuk setiap item dalam array items[]:"),
      schemaTable([
        ["item_code",  "string", "WAJIB",    "Kode barang. Jika ada di master item akan di-link otomatis."],
        ["item_name",  "string", "WAJIB",    "Nama barang yang tercetak di PO."],
        ["uom_code",   "string", "WAJIB",    "Kode satuan. Contoh: PCS, KG, LTR. Jika ada di master UoM akan di-link otomatis."],
        ["uom_name",   "string", "OPSIONAL", "Nama satuan. Jika kosong dan uom_code ada di master, nama master digunakan."],
        ["qty",        "number", "WAJIB",    "Kuantitas barang. Harus lebih dari 0."],
        ["unit_price", "number", "WAJIB",    "Harga satuan dalam Rupiah (IDR). Harus lebih dari 0."],
      ]),
      pSpacer(),

      h2("6.2 Schema Response — GET /api/v1/pos"),
      schemaTable([
        ["id",           "number",      "", "ID internal PO di sistem"],
        ["po_number",    "string",      "", "Nomor PO"],
        ["vendor_email", "string",      "", "Email vendor penerima PO"],
        ["vendor_name",  "string",      "", "Nama perusahaan vendor"],
        ["status",       "string",      "", "active | closed"],
        ["notes",        "string|null", "", "Catatan PO"],
        ["total_value",  "number",      "", "Total nilai PO dalam Rupiah (sum qty x unit_price)"],
        ["created_at",   "number",      "", "Timestamp Unix (ms) saat PO dibuat"],
        ["items",        "array",       "", "Daftar item PO (hanya tersedia di GET /pos/{po_number})"],
      ], false),
      pSpacer(),

      p("Setiap item dalam array items[]:"),
      schemaTable([
        ["item_code",  "string", "",  "Kode barang"],
        ["item_name",  "string", "",  "Nama barang"],
        ["uom_code",   "string", "",  "Kode satuan"],
        ["uom_name",   "string", "",  "Nama satuan"],
        ["qty",        "string", "",  "Kuantitas (desimal, format string)"],
        ["unit_price", "string", "",  "Harga satuan (desimal, format string)"],
        ["subtotal",   "string", "",  "qty x unit_price (desimal, format string)"],
      ], false),
      pSpacer(),

      h2("6.3 Query Parameters — GET /api/v1/pos"),
      schemaTable([
        ["vendor_email", "string", "OPSIONAL", "Filter PO milik vendor tertentu berdasarkan email"],
        ["status",       "string", "OPSIONAL", "Filter berdasarkan status: active | closed"],
      ]),
      pSpacer(),

      h2("6.4 Contoh Penggunaan"),
      h3("Buat PO Baru dengan Items"),
      codeBlock(
`curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "po_number":    "PO-2024-001",
       "vendor_email": "supplier@ptcontoh.com",
       "notes":        "Pengiriman ke Gudang A — sebelum tgl 30",
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
     }' \\
     https://portal.arenacorp.com/api/v1/pos

# Response (201 Created)
{
  "success": true, "action": "created",
  "data": {
    "id": 42, "po_number": "PO-2024-001",
    "vendor_email":  "supplier@ptcontoh.com",
    "vendor_name":   "PT Contoh Supplier",
    "status":        "active",
    "total_value":   275000,
    "created_at":    1712000000000,
    "items": [
      { "item_code": "ITM001", "item_name": "Baut M8 x 20mm", "qty": "500", "unit_price": "350.00", "subtotal": "175000.00" },
      { "item_code": "ITM002", "item_name": "Mur M8",          "qty": "500", "unit_price": "200.00", "subtotal": "100000.00" }
    ]
  }
}`),
      pSpacer(),

      h3("Update PO (Upsert — ganti seluruh items)"),
      codeBlock(
`# Kirim ulang dengan po_number yang sama → items lama dihapus, diganti yang baru
curl -X POST \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     -H "Content-Type: application/json" \\
     -d '{
       "po_number":    "PO-2024-001",
       "vendor_email": "supplier@ptcontoh.com",
       "items": [
         { "item_code": "ITM001", "item_name": "Baut M8 x 20mm", "uom_code": "PCS", "qty": 600, "unit_price": 350 },
         { "item_code": "ITM003", "item_name": "Ring M8",         "uom_code": "PCS", "qty": 600, "unit_price": 150 }
       ]
     }' \\
     https://portal.arenacorp.com/api/v1/pos

# Response
{ "success": true, "action": "updated", "data": { "po_number": "PO-2024-001", "total_value": 300000, ... } }`),
      pSpacer(),

      h3("Ambil Detail PO beserta Items"),
      codeBlock(
`curl -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/pos/PO-2024-001

# Response
{
  "success": true,
  "data": {
    "po_number": "PO-2024-001", "vendor_name": "PT Contoh Supplier",
    "status": "active", "total_value": 300000,
    "items": [ { ... }, { ... } ]
  }
}`),
      pSpacer(),

      h3("List PO per Vendor dengan Filter Status"),
      codeBlock(
`curl -H "X-API-Key: pf_xxxxxxxxxx" \\
     "https://portal.arenacorp.com/api/v1/pos?vendor_email=supplier%40ptcontoh.com&status=active"

# Response
{ "success": true, "count": 2, "data": [ { "po_number": "PO-2024-001", ... }, ... ] }`),
      pSpacer(),

      h3("Tutup PO"),
      codeBlock(
`curl -X DELETE \\
     -H "X-API-Key: pf_xxxxxxxxxx" \\
     https://portal.arenacorp.com/api/v1/pos/PO-2024-001

# Response
{ "success": true, "message": "PO 'PO-2024-001' telah ditutup." }`),
      pSpacer(),

      // ── 7. HTTP Codes ─────────────────────────────────────────────────────
      sectionTitle("7. HTTP Status Codes & Error Handling"),
      httpStatusTable(),
      pSpacer(),

      h2("Format Error Response"),
      codeBlock(
`// 401 Unauthorized
{ "error": "Unauthorized", "message": "API Key diperlukan. Sertakan header X-API-Key." }

// 400 Bad Request
{ "error": "Field wajib tidak lengkap", "required": ["code", "name"] }

// 404 Not Found
{ "error": "Item tidak ditemukan", "code": "ITM999" }

// 500 Internal Server Error
{ "error": "Internal server error" }`),
      pSpacer(),

      // ── 8. Catatan Penting ────────────────────────────────────────────────
      sectionTitle("8. Catatan Penting"),
      bulletItem("Semua operasi POST menggunakan upsert — insert jika kode/email/po_number belum ada, update jika sudah ada."),
      bulletItem("Kode (code), email, dan po_number bersifat case-sensitive dan harus unik dalam sistemnya masing-masing."),
      bulletItem("Bulk endpoint menerima array di field data. Maksimal 500 item per satu request."),
      bulletItem("DELETE hanya melakukan soft delete — data tetap tersimpan dengan is_active: false (UoM/Item) atau status=suspended (Vendor) atau status=closed (PO)."),
      bulletItem("Respons error bulk import tetap mengembalikan HTTP 200 dengan detail per baris di field errors."),
      bulletItem("Email vendor di URL harus di-encode: @ menjadi %40 (contoh: vendor%40ptcontoh.com)."),
      bulletItem("Upsert PO akan menghapus semua item lama dan menggantinya dengan items yang dikirim dalam request terbaru."),
      bulletItem("Gunakan GET /api/v1/pos?vendor_email=...&status=active untuk sinkronisasi PO aktif ke sistem eksternal."),
      bulletItem("last_used_at pada API Key diperbarui secara otomatis setiap kali request masuk."),
      bulletItem("API Key yang dinonaktifkan oleh admin tidak dapat digunakan kembali — buat API Key baru jika diperlukan."),
      pSpacer(),
      pNote("Untuk pertanyaan teknis atau pengajuan akses API, hubungi tim IT ProcureFlow melalui email internal atau tiket helpdesk."),
    ],
  }],
});

// ─── Save file ────────────────────────────────────────────────────────────────
console.log("Generating DOCX...");
const buffer = await Packer.toBuffer(doc);
writeFileSync(OUTPUT, buffer);
console.log(`✅ DOCX berhasil dibuat: ${OUTPUT}`);
console.log(`   Ukuran: ${(buffer.length / 1024).toFixed(1)} KB`);
