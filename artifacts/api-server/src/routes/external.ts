import { Router } from "express";
import { db } from "@workspace/db";
import { vendorCompaniesTable, vendorInvoicesTable, externalUsersTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lte, ne } from "drizzle-orm";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { uploadToGoogleDrive, guessMimeType } from "../lib/googleDrive";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "pr_po_salt_2024").digest("hex");
}

function generateAuthCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function getSettingValue(key: string): Promise<string | null> {
  try {
    const { settingsTable } = await import("@workspace/db/schema");
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
    return row?.value ?? null;
  } catch { return null; }
}

async function getExternalSmtp() {
  const [host, port, user, pass, security] = await Promise.all([
    getSettingValue("ext_smtp_host"),
    getSettingValue("ext_smtp_port"),
    getSettingValue("ext_smtp_user"),
    getSettingValue("ext_smtp_pass"),
    getSettingValue("ext_smtp_security"),
  ]);
  // fallback to main smtp settings
  const [mHost, mPort, mUser, mPass, mSec] = await Promise.all([
    getSettingValue("smtp_host"),
    getSettingValue("smtp_port"),
    getSettingValue("smtp_user"),
    getSettingValue("smtp_pass"),
    getSettingValue("smtp_security"),
  ]);
  return {
    host: host || mHost || "",
    port: parseInt(port || mPort || "587"),
    user: user || mUser || "",
    pass: pass || mPass || "",
    security: security || mSec || "STARTTLS",
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const smtp = await getExternalSmtp();
  if (!smtp.host || !smtp.user) return;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.security === "TLS",
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
  });
  await transporter.sendMail({ from: smtp.user, to, subject, html });
}

function requireExternal(role?: "admin" | "user") {
  return (req: any, res: any, next: any) => {
    const sess = req.session as any;
    if (sess.extUserId) {
      if (role === "admin" && sess.extUserRole !== "admin") {
        return res.status(403).json({ error: "Admin only" });
      }
      return next();
    }
    if (sess.vendorId) {
      if (role) return res.status(403).json({ error: "External users only" });
      return next();
    }
    return res.status(401).json({ error: "Unauthorized" });
  };
}

function requireExtUser(role?: "admin") {
  return (req: any, res: any, next: any) => {
    const sess = req.session as any;
    if (!sess.extUserId) return res.status(403).json({ error: "External user login required" });
    if (role === "admin" && sess.extUserRole !== "admin") return res.status(403).json({ error: "Admin only" });
    return next();
  };
}

function requireVendor() {
  return (req: any, res: any, next: any) => {
    const sess = req.session as any;
    if (!sess.vendorId) return res.status(403).json({ error: "Vendor login required" });
    return next();
  };
}

async function getFileConfig() {
  const [maxSize, types] = await Promise.all([
    getSettingValue("ext_max_file_size"),
    getSettingValue("ext_allowed_file_types"),
  ]);
  return {
    maxSizeMb: parseInt(maxSize || "5"),
    allowedTypes: (types || "jpg,jpeg,png,pdf").split(",").map(t => t.trim().toLowerCase()),
  };
}

// ─── Auth: Vendor ──────────────────────────────────────────────────────────────

// POST /api/external/auth/register
router.post("/auth/register", async (req, res) => {
  try {
    const {
      companyName, companyAddress, picName, picPhone,
      officePhone, email, password,
      ktpAttachment, ktpFilename,
      bankName, bankAccount, bankAccountName,
    } = req.body;
    if (!companyName || !companyAddress || !picName || !picPhone || !email || !password) {
      return res.status(400).json({ error: "Semua field wajib diisi" });
    }
    if (!ktpAttachment || !ktpFilename) {
      return res.status(400).json({ error: "Foto KTP wajib diunggah" });
    }

    const existing = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.email, email.toLowerCase()));
    if (existing.length > 0) return res.status(409).json({ error: "Email sudah terdaftar" });

    const authCode = generateAuthCode();
    const authCodeExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24h

    let finalKtpAttachment: string = ktpAttachment;
    try {
      const folderSetting = await getSettingValue("ext_gdrive_folder");
      const folderIdOrUrl = folderSetting || "0AAxCInqK40uzUk9PVA";
      const gdrive = await uploadToGoogleDrive({
        base64Data: ktpAttachment,
        filename: ktpFilename,
        mimeType: guessMimeType(ktpFilename),
        folderIdOrUrl,
        companyName,
        label: "KTP",
      });
      finalKtpAttachment = gdrive.webViewLink;
    } catch (e) {
      console.error("GDrive upload error (ktp):", e);
    }

    const [vendor] = await db.insert(vendorCompaniesTable).values({
      companyName, companyAddress, picName, picPhone,
      officePhone: officePhone || picPhone,
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
      ktpAttachment: finalKtpAttachment,
      ktpFilename: ktpFilename || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      bankAccountName: bankAccountName || null,
      status: "pending",
      authCode,
      authCodeExpiresAt,
      createdAt: Date.now(),
    }).returning();

    // Send auth code email
    try {
      await sendEmail(email, "Kode Aktivasi Akun Vendor - ProcureFlow",
        `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px">
          <h2 style="color:#1e40af">Kode Aktivasi Akun Vendor</h2>
          <p>Halo <b>${picName}</b>,</p>
          <p>Terima kasih telah mendaftar sebagai vendor di ProcureFlow.<br>Gunakan kode berikut untuk mengaktifkan akun Anda:</p>
          <div style="background:#f0f9ff;border:2px dashed #3b82f6;border-radius:8px;padding:24px;text-align:center;margin:24px 0">
            <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1e40af">${authCode}</span>
          </div>
          <p style="color:#6b7280;font-size:14px">Kode berlaku selama 24 jam. Jika Anda tidak mendaftar, abaikan email ini.</p>
        </div>`
      );
    } catch (e) { console.error("Email send error:", e); }

    res.json({ success: true, vendorId: vendor.id, message: "Registrasi berhasil. Kode aktivasi telah dikirim ke email Anda." });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/auth/vendor-login
router.post("/auth/vendor-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email dan password wajib diisi" });

    const [vendor] = await db.select().from(vendorCompaniesTable)
      .where(and(eq(vendorCompaniesTable.email, email.toLowerCase()), eq(vendorCompaniesTable.passwordHash, hashPassword(password))));
    if (!vendor) return res.status(401).json({ error: "Email atau password salah" });

    (req.session as any).vendorId = vendor.id;
    (req.session as any).vendorStatus = vendor.status;

    res.json({
      success: true,
      vendor: {
        id: vendor.id,
        companyName: vendor.companyName,
        picName: vendor.picName,
        email: vendor.email,
        status: vendor.status,
      }
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/auth/verify-code
router.post("/auth/verify-code", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const { code } = req.body;
    const [vendor] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });
    if (vendor.status === "active") return res.json({ success: true, message: "Akun sudah aktif" });
    if (vendor.authCode !== code) return res.status(400).json({ error: "Kode tidak valid" });
    if (vendor.authCodeExpiresAt && vendor.authCodeExpiresAt < Date.now()) {
      return res.status(400).json({ error: "Kode sudah kadaluarsa. Minta kode baru." });
    }
    await db.update(vendorCompaniesTable).set({ status: "active", authCode: null, authCodeExpiresAt: null })
      .where(eq(vendorCompaniesTable.id, vendor.id));
    sess.vendorStatus = "active";
    res.json({ success: true, message: "Akun berhasil diaktifkan!" });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/auth/resend-code
router.post("/auth/resend-code", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const [vendor] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });
    if (vendor.status === "active") return res.json({ success: true });
    const authCode = generateAuthCode();
    const authCodeExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await db.update(vendorCompaniesTable).set({ authCode, authCodeExpiresAt }).where(eq(vendorCompaniesTable.id, vendor.id));
    try {
      await sendEmail(vendor.email, "Kode Aktivasi Baru - ProcureFlow",
        `<p>Halo <b>${vendor.picName}</b>, kode aktivasi baru Anda: <b style="font-size:24px;letter-spacing:4px">${authCode}</b><br>Berlaku 24 jam.</p>`
      );
    } catch (e) { console.error("Email send error:", e); }
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/external/auth/me
router.get("/auth/me", async (req: any, res) => {
  const sess = req.session as any;
  if (sess.extUserId) {
    return res.json({ type: "user", id: sess.extUserId, name: sess.extUserName, username: sess.extUsername, role: sess.extUserRole, email: sess.extUserEmail });
  }
  if (sess.vendorId) {
    try {
      const [v] = await db.select({ name: vendorCompaniesTable.name, email: vendorCompaniesTable.email })
        .from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
      return res.json({ type: "vendor", id: sess.vendorId, status: sess.vendorStatus, name: v?.name || "Vendor", email: v?.email || "" });
    } catch {
      return res.json({ type: "vendor", id: sess.vendorId, status: sess.vendorStatus, name: "Vendor", email: "" });
    }
  }
  res.status(401).json({ error: "Not logged in" });
});

// POST /api/external/auth/logout
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ─── Auth: External Users ──────────────────────────────────────────────────────

// POST /api/external/auth/user-login
router.post("/auth/user-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username dan password wajib diisi" });
    const [user] = await db.select().from(externalUsersTable)
      .where(and(eq(externalUsersTable.username, username), eq(externalUsersTable.passwordHash, hashPassword(password))));
    if (!user) return res.status(401).json({ error: "Username atau password salah" });
    if (!user.isActive) return res.status(403).json({ error: "Akun tidak aktif" });

    (req.session as any).extUserId = user.id;
    (req.session as any).extUsername = user.username;
    (req.session as any).extUserName = user.name;
    (req.session as any).extUserRole = user.role;
    (req.session as any).extUserEmail = user.email || "";

    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Invoices ──────────────────────────────────────────────────────────────────

// GET /api/external/invoices
router.get("/invoices", requireExternal(), async (req, res) => {
  try {
    const sess = req.session as any;
    const { month, year, vendorId } = req.query;
    let invoices: any[];

    let conditions: any[] = [];
    if (month && year) {
      const startMs = new Date(Number(year), Number(month) - 1, 1).getTime();
      const endMs   = new Date(Number(year), Number(month), 0, 23, 59, 59).getTime();
      conditions.push(gte(vendorInvoicesTable.createdAt, startMs));
      conditions.push(lte(vendorInvoicesTable.createdAt, endMs));
    }

    if (sess.vendorId) {
      conditions.push(eq(vendorInvoicesTable.vendorCompanyId, sess.vendorId));
      invoices = await db.select().from(vendorInvoicesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(vendorInvoicesTable.createdAt));
    } else {
      if (vendorId) conditions.push(eq(vendorInvoicesTable.vendorCompanyId, Number(vendorId)));
      invoices = await db.select().from(vendorInvoicesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(vendorInvoicesTable.createdAt));
    }
    res.json(invoices);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/invoices
router.post("/invoices", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    if ((sess.vendorStatus || "") !== "active") return res.status(403).json({ error: "Akun vendor belum aktif" });

    const [vendor] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });

    const { poNumber, picName, picPhone, totalInvoice, attachment, attachmentFilename } = req.body;
    if (!poNumber || !picName || !picPhone || !totalInvoice) return res.status(400).json({ error: "Semua field wajib diisi" });

    let finalAttachment: string | null = attachment || null;
    let finalAttachmentFilename: string | null = attachmentFilename || null;

    if (attachment && attachmentFilename) {
      try {
        const folderSetting = await getSettingValue("ext_gdrive_folder");
        const folderIdOrUrl = folderSetting || "0AAxCInqK40uzUk9PVA";
        const gdrive = await uploadToGoogleDrive({
          base64Data: attachment,
          filename: attachmentFilename,
          mimeType: guessMimeType(attachmentFilename),
          folderIdOrUrl,
          companyName: vendor.companyName,
          label: poNumber,
        });
        finalAttachment = gdrive.webViewLink;
        finalAttachmentFilename = attachmentFilename;
      } catch (e) {
        console.error("GDrive upload error (invoice):", e);
      }
    }

    const [inv] = await db.insert(vendorInvoicesTable).values({
      vendorCompanyId: sess.vendorId,
      companyName: vendor.companyName,
      poNumber, picName, picPhone, totalInvoice,
      attachment: finalAttachment,
      attachmentFilename: finalAttachmentFilename,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).returning();

    // Notify internal users
    try {
      const users = await db.select().from(externalUsersTable).where(eq(externalUsersTable.isActive, true));
      for (const u of users) {
        if (u.email) {
          await sendEmail(u.email, `Invoice Baru dari ${vendor.companyName} - ProcureFlow`,
            `<div style="font-family:Arial,sans-serif;max-width:480px">
              <h3 style="color:#1e40af">Invoice Baru Masuk</h3>
              <p>Invoice baru telah disubmit oleh <b>${vendor.companyName}</b>.</p>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;color:#6b7280">No Invoice</td><td style="padding:4px 8px"><b>#${inv.id}</b></td></tr>
                <tr><td style="padding:4px 8px;color:#6b7280">No PO</td><td style="padding:4px 8px">${poNumber}</td></tr>
                <tr><td style="padding:4px 8px;color:#6b7280">Total Invoice</td><td style="padding:4px 8px"><b>Rp ${Number(totalInvoice).toLocaleString("id-ID")}</b></td></tr>
              </table>
              <p>Silakan login ke Sistem External untuk memproses invoice ini.</p>
            </div>`
          );
        }
      }
    } catch (e) { console.error("Notify error:", e); }

    res.json({ success: true, invoice: inv });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/external/invoices/:id/status
router.patch("/invoices/:id/status", requireExtUser(), async (req, res) => {
  try {
    const sess = req.session as any;
    const { status, notes } = req.body;
    const validStatuses = ["pending", "process", "completed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Status tidak valid" });

    const [inv] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, Number(req.params.id)));
    if (!inv) return res.status(404).json({ error: "Invoice tidak ditemukan" });

    const [updated] = await db.update(vendorInvoicesTable).set({
      status, notes: notes || inv.notes,
      statusChangedBy: sess.extUsername,
      statusChangedAt: Date.now(),
      updatedAt: Date.now(),
    }).where(eq(vendorInvoicesTable.id, inv.id)).returning();

    // Notify vendor
    try {
      const [vendor] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, inv.vendorCompanyId));
      if (vendor?.email) {
        const statusLabel = status === "pending" ? "Pending" : status === "process" ? "Sedang Diproses" : "Selesai Dibayar";
        await sendEmail(vendor.email, `Update Status Invoice #${inv.id} - ProcureFlow`,
          `<div style="font-family:Arial,sans-serif;max-width:480px">
            <h3 style="color:#1e40af">Update Status Invoice</h3>
            <p>Halo <b>${vendor.picName}</b>,</p>
            <p>Status Invoice <b>#${inv.id}</b> (No PO: ${inv.poNumber}) telah diupdate menjadi:</p>
            <div style="background:${status === "completed" ? "#f0fdf4" : status === "process" ? "#eff6ff" : "#fafafa"};border-radius:8px;padding:16px;text-align:center;margin:16px 0">
              <span style="font-size:20px;font-weight:bold;color:${status === "completed" ? "#15803d" : status === "process" ? "#1d4ed8" : "#374151"}">${statusLabel}</span>
            </div>
            ${notes ? `<p><b>Catatan:</b> ${notes}</p>` : ""}
          </div>`
        );
      }
    } catch (e) { console.error("Notify error:", e); }

    res.json({ success: true, invoice: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/external/invoices/:id
router.get("/invoices/:id", requireExternal(), async (req, res) => {
  try {
    const sess = req.session as any;
    const [inv] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, Number(req.params.id)));
    if (!inv) return res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (sess.vendorId && inv.vendorCompanyId !== sess.vendorId) return res.status(403).json({ error: "Forbidden" });
    res.json(inv);
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Vendor Company Info ───────────────────────────────────────────────────────

// GET /api/external/vendor/me
router.get("/vendor/me", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const [v] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!v) return res.status(404).json({ error: "Not found" });
    const { passwordHash, authCode, ktpAttachment, ...safe } = v;
    res.json(safe);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// ─── Reports ───────────────────────────────────────────────────────────────────

// GET /api/external/reports/invoices?month=&year=&vendorId=
router.get("/reports/invoices", requireExternal(), async (req, res) => {
  try {
    const sess = req.session as any;
    const { month, year, vendorId } = req.query;
    let conditions: any[] = [];
    if (month && year) {
      const startMs = new Date(Number(year), Number(month) - 1, 1).getTime();
      const endMs   = new Date(Number(year), Number(month), 0, 23, 59, 59).getTime();
      conditions.push(gte(vendorInvoicesTable.createdAt, startMs));
      conditions.push(lte(vendorInvoicesTable.createdAt, endMs));
    }
    if (sess.vendorId) {
      conditions.push(eq(vendorInvoicesTable.vendorCompanyId, sess.vendorId));
    } else if (vendorId) {
      conditions.push(eq(vendorInvoicesTable.vendorCompanyId, Number(vendorId)));
    }
    const invoices = await db.select().from(vendorInvoicesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(vendorInvoicesTable.createdAt));

    const summary = {
      total: invoices.length,
      totalAmount: invoices.reduce((s, i) => s + Number(i.totalInvoice), 0),
      pending: invoices.filter(i => i.status === "pending").length,
      process: invoices.filter(i => i.status === "process").length,
      completed: invoices.filter(i => i.status === "completed").length,
      completedAmount: invoices.filter(i => i.status === "completed").reduce((s, i) => s + Number(i.totalInvoice), 0),
    };
    res.json({ invoices, summary });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/external/reports/payments?month=&year=&vendorId=
router.get("/reports/payments", requireExtUser(), async (req, res) => {
  try {
    const { month, year, vendorId } = req.query;
    let conditions: any[] = [eq(vendorInvoicesTable.status, "completed")];
    if (month && year) {
      const startMs = new Date(Number(year), Number(month) - 1, 1).getTime();
      const endMs   = new Date(Number(year), Number(month), 0, 23, 59, 59).getTime();
      conditions.push(gte(vendorInvoicesTable.statusChangedAt as any, startMs));
      conditions.push(lte(vendorInvoicesTable.statusChangedAt as any, endMs));
    }
    if (vendorId) conditions.push(eq(vendorInvoicesTable.vendorCompanyId, Number(vendorId)));

    const invoices = await db.select().from(vendorInvoicesTable)
      .where(and(...conditions)).orderBy(desc(vendorInvoicesTable.statusChangedAt));

    const totalPaid = invoices.reduce((s, i) => s + Number(i.totalInvoice), 0);
    res.json({ invoices, totalPaid, count: invoices.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Vendors List (for user) ───────────────────────────────────────────────────

// GET /api/external/vendors
router.get("/vendors", requireExtUser(), async (req, res) => {
  try {
    const vendors = await db.select({
      id: vendorCompaniesTable.id,
      companyName: vendorCompaniesTable.companyName,
      picName: vendorCompaniesTable.picName,
      email: vendorCompaniesTable.email,
      status: vendorCompaniesTable.status,
      createdAt: vendorCompaniesTable.createdAt,
    }).from(vendorCompaniesTable).orderBy(desc(vendorCompaniesTable.createdAt));
    res.json(vendors);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/external/vendors/:id/status
router.patch("/vendors/:id/status", requireExtUser("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    await db.update(vendorCompaniesTable).set({ status }).where(eq(vendorCompaniesTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// ─── External User Management ──────────────────────────────────────────────────

// GET /api/external/users
router.get("/users", requireExtUser("admin"), async (req, res) => {
  try {
    const users = await db.select({
      id: externalUsersTable.id,
      username: externalUsersTable.username,
      name: externalUsersTable.name,
      email: externalUsersTable.email,
      role: externalUsersTable.role,
      isActive: externalUsersTable.isActive,
      createdAt: externalUsersTable.createdAt,
    }).from(externalUsersTable).orderBy(desc(externalUsersTable.createdAt));
    res.json(users);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/users
router.post("/users", requireExtUser("admin"), async (req, res) => {
  try {
    const { username, password, name, email, role } = req.body;
    if (!username || !password || !name || !email) return res.status(400).json({ error: "Field wajib tidak lengkap" });
    const existing = await db.select().from(externalUsersTable).where(eq(externalUsersTable.username, username));
    if (existing.length > 0) return res.status(409).json({ error: "Username sudah dipakai" });
    const [user] = await db.insert(externalUsersTable).values({
      username, passwordHash: hashPassword(password), name, email,
      role: role || "user", isActive: true, createdAt: Date.now(),
    }).returning();
    const { passwordHash, ...safe } = user;
    res.json(safe);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// PATCH /api/external/users/:id
router.patch("/users/:id", requireExtUser("admin"), async (req, res) => {
  try {
    const { name, email, role, isActive, password } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = hashPassword(password);
    await db.update(externalUsersTable).set(updates).where(eq(externalUsersTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// DELETE /api/external/users/:id
router.delete("/users/:id", requireExtUser("admin"), async (req, res) => {
  try {
    const sess = req.session as any;
    if (Number(req.params.id) === sess.extUserId) return res.status(400).json({ error: "Tidak bisa hapus akun sendiri" });
    await db.delete(externalUsersTable).where(eq(externalUsersTable.id, Number(req.params.id)));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// ─── Settings ──────────────────────────────────────────────────────────────────

async function upsertSetting(key: string, value: string) {
  const { settingsTable } = await import("@workspace/db/schema");
  await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

// GET /api/external/settings
router.get("/settings", requireExtUser("admin"), async (req, res) => {
  try {
    const keys = ["ext_smtp_host", "ext_smtp_port", "ext_smtp_user", "ext_smtp_security", "ext_max_file_size", "ext_allowed_file_types", "ext_gdrive_folder"];
    const vals = await Promise.all(keys.map(k => getSettingValue(k)));
    res.json({
      smtpHost: vals[0] || "",
      smtpPort: vals[1] || "587",
      smtpUser: vals[2] || "",
      smtpSecurity: vals[3] || "STARTTLS",
      maxFileSizeMb: vals[4] || "5",
      allowedFileTypes: vals[5] || "jpg,jpeg,png,pdf",
      gdriveFolderUrl: vals[6] || "https://drive.google.com/drive/folders/0AAxCInqK40uzUk9PVA",
    });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/external/settings
router.put("/settings", requireExtUser("admin"), async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecurity, maxFileSizeMb, allowedFileTypes, gdriveFolderUrl } = req.body;
    if (smtpHost !== undefined) await upsertSetting("ext_smtp_host", smtpHost);
    if (smtpPort !== undefined) await upsertSetting("ext_smtp_port", smtpPort);
    if (smtpUser !== undefined) await upsertSetting("ext_smtp_user", smtpUser);
    if (smtpPass && smtpPass !== "***") await upsertSetting("ext_smtp_pass", smtpPass);
    if (smtpSecurity !== undefined) await upsertSetting("ext_smtp_security", smtpSecurity);
    if (maxFileSizeMb !== undefined) await upsertSetting("ext_max_file_size", String(maxFileSizeMb));
    if (allowedFileTypes !== undefined) await upsertSetting("ext_allowed_file_types", allowedFileTypes);
    if (gdriveFolderUrl !== undefined) await upsertSetting("ext_gdrive_folder", gdriveFolderUrl);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
