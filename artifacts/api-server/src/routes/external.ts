import { Router } from "express";
import { db } from "../lib/db.js";
import { vendorCompaniesTable, vendorInvoicesTable, externalUsersTable, masterItemsTable, masterUomsTable, vendorInvoiceItemsTable, auditLogsTable, vendorBankChangeRequestsTable, externalPurchaseOrdersTable, externalPoItemsTable, externalPoChangeRequestsTable, externalPoChangeItemsTable, apiKeysTable } from "@workspace/db/schema";
import { eq, and, desc, gte, lte, ne, ilike, or, sql } from "drizzle-orm";
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

/** Kumpulkan email vendor + semua internal user aktif untuk GDrive sharing */
async function getShareEmails(vendorEmail?: string): Promise<string[]> {
  try {
    const internalUsers = await db.select({ email: externalUsersTable.email })
      .from(externalUsersTable)
      .where(eq(externalUsersTable.isActive, true));
    const emails = internalUsers.map(u => u.email).filter(Boolean) as string[];
    if (vendorEmail) emails.push(vendorEmail);
    return [...new Set(emails)];
  } catch { return vendorEmail ? [vendorEmail] : []; }
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

/** Catat aktivitas ke audit_logs — tidak boleh throw agar tidak mengganggu flow utama */
async function logAudit(
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  details?: string
) {
  try {
    await db.insert(auditLogsTable).values({
      userId,
      action,
      entityType,
      entityId: entityId || 0,
      details: details || null,
    });
  } catch (e) {
    console.error("[AuditLog] Gagal menulis audit log:", e);
  }
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
      const [folderSetting, shareEmails] = await Promise.all([
        getSettingValue("ext_gdrive_folder"),
        getShareEmails(email.toLowerCase()),
      ]);
      const folderIdOrUrl = folderSetting || "0AAxCInqK40uzUk9PVA";
      const gdrive = await uploadToGoogleDrive({
        base64Data: ktpAttachment,
        filename: ktpFilename,
        mimeType: guessMimeType(ktpFilename),
        folderIdOrUrl,
        companyName,
        label: "KTP",
        shareWithEmails: shareEmails,
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
    if (!vendor) {
      await logAudit(0, "vendor_login_error", "ext_vendor", 0, `Login gagal: email ${email}`);
      return res.status(401).json({ error: "Email atau password salah" });
    }

    (req.session as any).vendorId = vendor.id;
    (req.session as any).vendorStatus = vendor.status;

    await logAudit(vendor.id, "vendor_login", "ext_vendor", vendor.id, vendor.companyName);
    res.json({
      success: true,
      needsVerification: vendor.status !== "active",
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
    const smtp = await getExternalSmtp();
    const smtpConfigured = !!(smtp.host && smtp.user);
    let emailSent = false;
    if (smtpConfigured) {
      try {
        await sendEmail(vendor.email, "Kode Aktivasi Baru - ProcureFlow",
          `<p>Halo <b>${vendor.picName}</b>, kode aktivasi baru Anda: <b style="font-size:24px;letter-spacing:4px">${authCode}</b><br>Berlaku 24 jam.</p>`
        );
        emailSent = true;
      } catch (e) { console.error("Email send error:", e); }
    }
    res.json({ success: true, emailSent, code: smtpConfigured ? undefined : authCode });
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
      const [v] = await db.select({ companyName: vendorCompaniesTable.companyName, email: vendorCompaniesTable.email })
        .from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
      return res.json({ type: "vendor", id: sess.vendorId, status: sess.vendorStatus, name: v?.companyName || "Vendor", email: v?.email || "" });
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

// POST /api/external/auth/change-password — vendor ganti password sendiri
router.post("/auth/change-password", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Password lama dan baru wajib diisi" });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password baru minimal 6 karakter" });

    const [vendor] = await db.select().from(vendorCompaniesTable)
      .where(and(eq(vendorCompaniesTable.id, sess.vendorId), eq(vendorCompaniesTable.passwordHash, hashPassword(currentPassword))));
    if (!vendor) return res.status(401).json({ error: "Password lama tidak sesuai" });

    await db.update(vendorCompaniesTable)
      .set({ passwordHash: hashPassword(newPassword) })
      .where(eq(vendorCompaniesTable.id, sess.vendorId));

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Auth: External Users ──────────────────────────────────────────────────────

// POST /api/external/auth/user-login
router.post("/auth/user-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username dan password wajib diisi" });
    const [user] = await db.select().from(externalUsersTable)
      .where(and(eq(externalUsersTable.username, username), eq(externalUsersTable.passwordHash, hashPassword(password))));
    if (!user) {
      await logAudit(0, "user_login_error", "ext_user", 0, `Login gagal: username ${username}`);
      return res.status(401).json({ error: "Username atau password salah" });
    }
    if (!user.isActive) {
      await logAudit(user.id, "user_login_error", "ext_user", user.id, "Akun tidak aktif");
      return res.status(403).json({ error: "Akun tidak aktif" });
    }

    (req.session as any).extUserId = user.id;
    (req.session as any).extUsername = user.username;
    (req.session as any).extUserName = user.name;
    (req.session as any).extUserRole = user.role;
    (req.session as any).extUserEmail = user.email || "";

    await logAudit(user.id, "user_login", "ext_user", user.id, user.name);
    res.json({ success: true, user: { id: user.id, username: user.username, name: user.name, role: user.role, email: user.email } });
  } catch (err) {
    console.error("[user-login]", err);
    await logAudit(0, "user_login_error", "ext_user", 0, String(err));
    res.status(500).json({ error: "Internal server error" });
  }
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

    const { poNumber, picName, picPhone, attachment, attachmentFilename, items } = req.body;
    if (!poNumber || !picName || !picPhone) return res.status(400).json({ error: "Semua field wajib diisi" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Minimal satu item harus diisi" });

    // Validate and calculate total from items
    let totalCalc = 0;
    for (const item of items) {
      if (!item.itemId || !item.uomId || !item.qty || !item.pricePerUom) {
        return res.status(400).json({ error: "Data item tidak lengkap (itemId, uomId, qty, pricePerUom wajib)" });
      }
      const qty = Number(item.qty);
      const price = Number(item.pricePerUom);
      if (qty <= 0 || price < 0) return res.status(400).json({ error: "Qty dan harga harus bernilai positif" });
      totalCalc += qty * price;
    }
    const totalInvoice = String(Math.round(totalCalc));

    let finalAttachment: string | null = attachment || null;
    let finalAttachmentFilename: string | null = attachmentFilename || null;

    if (attachment && attachmentFilename) {
      try {
        const [folderSetting, shareEmails] = await Promise.all([
          getSettingValue("ext_gdrive_folder"),
          getShareEmails(vendor.email),
        ]);
        const folderIdOrUrl = folderSetting || "0AAxCInqK40uzUk9PVA";
        const gdrive = await uploadToGoogleDrive({
          base64Data: attachment,
          filename: attachmentFilename,
          mimeType: guessMimeType(attachmentFilename),
          folderIdOrUrl,
          companyName: vendor.companyName,
          label: poNumber,
          shareWithEmails: shareEmails,
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

    // Insert invoice items
    for (const item of items) {
      const qty = Number(item.qty);
      const price = Number(item.pricePerUom);
      const subtotal = qty * price;
      await db.insert(vendorInvoiceItemsTable).values({
        invoiceId: inv.id,
        itemId: Number(item.itemId),
        itemCode: item.itemCode || "",
        itemName: item.itemName || "",
        uomId: Number(item.uomId),
        uomName: item.uomName || "",
        qty: String(qty),
        pricePerUom: String(price),
        subtotal: String(subtotal),
      });
    }

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

    await logAudit(sess.vendorId, "submit_invoice", "ext_invoice", inv.id,
      `PO: ${poNumber}, Total: ${totalInvoice}, Items: ${items.length}`);
    res.json({ success: true, invoice: inv });
  } catch (err) {
    console.error("[submit-invoice]", err);
    const sess = (req as any).session as any;
    await logAudit(sess?.vendorId || 0, "submit_invoice_error", "ext_invoice", 0, String(err));
    res.status(500).json({ error: "Internal server error" });
  }
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

    await logAudit(sess.extUserId, "update_invoice_status", "ext_invoice", inv.id,
      `Status: ${status}${notes ? `, Catatan: ${notes}` : ""}`);
    res.json({ success: true, invoice: updated });
  } catch (err) {
    console.error("[update-invoice-status]", err);
    const sess = (req as any).session as any;
    await logAudit(sess?.extUserId || 0, "update_invoice_status_error", "ext_invoice", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: "Internal server error" });
  }
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
    const sess = req.session as any;
    const { status } = req.body;
    const vendorId = Number(req.params.id);
    await db.update(vendorCompaniesTable).set({ status }).where(eq(vendorCompaniesTable.id, vendorId));
    await logAudit(sess.extUserId, "update_vendor_status", "ext_vendor", vendorId, `Status: ${status}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[update-vendor-status]", err);
    const sess = (req as any).session as any;
    await logAudit(sess?.extUserId || 0, "update_vendor_status_error", "ext_vendor", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: "Internal server error" });
  }
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
  const sess = req.session as any;
  try {
    const { username, password, name, email, role } = req.body;
    if (!username || !password || !name || !email) {
      await logAudit(sess.extUserId, "create_ext_user_error", "ext_user", 0, `Field wajib tidak lengkap (username=${username}, name=${name}, email=${email})`);
      return res.status(400).json({ error: "Field wajib tidak lengkap" });
    }
    const existing = await db.select().from(externalUsersTable).where(eq(externalUsersTable.username, username));
    if (existing.length > 0) {
      await logAudit(sess.extUserId, "create_ext_user_error", "ext_user", 0, `Username sudah dipakai: ${username}`);
      return res.status(409).json({ error: "Username sudah dipakai" });
    }
    const [user] = await db.insert(externalUsersTable).values({
      username, passwordHash: hashPassword(password), name, email,
      role: role || "user", isActive: true, createdAt: Date.now(),
    }).returning();
    if (!user) throw new Error("Insert tidak mengembalikan data");
    const { passwordHash, ...safe } = user;
    await logAudit(sess.extUserId, "create_ext_user", "ext_user", user.id, `User: ${username} (${role || "user"})`);
    res.json(safe);
  } catch (err) {
    console.error("[create-user]", err);
    await logAudit(sess?.extUserId || 0, "create_ext_user_error", "ext_user", 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/external/users/:id
router.patch("/users/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const targetId = Number(req.params.id);
    const { name, email, role, isActive, password } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = hashPassword(password);
    await db.update(externalUsersTable).set(updates).where(eq(externalUsersTable.id, targetId));
    await logAudit(sess.extUserId, "update_ext_user", "ext_user", targetId,
      `Diubah: ${Object.keys(updates).filter(k => k !== "passwordHash").join(", ")}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[update-user]", err);
    await logAudit(sess?.extUserId || 0, "update_ext_user_error", "ext_user", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/external/users/:id
router.delete("/users/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const targetId = Number(req.params.id);
    if (targetId === sess.extUserId) return res.status(400).json({ error: "Tidak bisa hapus akun sendiri" });
    await db.delete(externalUsersTable).where(eq(externalUsersTable.id, targetId));
    await logAudit(sess.extUserId, "delete_ext_user", "ext_user", targetId, `Dihapus user ID: ${targetId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[delete-user]", err);
    await logAudit(sess?.extUserId || 0, "delete_ext_user_error", "ext_user", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
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
  const sess = req.session as any;
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
    await logAudit(sess.extUserId, "update_ext_settings", "ext_settings", 0,
      `Keys: ${Object.keys(req.body).join(", ")}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[update-settings]", err);
    const sess2 = (req as any).session as any;
    await logAudit(sess2?.extUserId || 0, "update_ext_settings_error", "ext_settings", 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// ─── Master UoM ───────────────────────────────────────────────────────────────

// GET /api/external/master/uoms
router.get("/master/uoms", requireExternal(), async (req, res) => {
  try {
    const uoms = await db.select().from(masterUomsTable)
      .where(eq(masterUomsTable.isActive, true))
      .orderBy(masterUomsTable.name);
    res.json(uoms);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/external/master/uoms/all (admin - include inactive)
router.get("/master/uoms/all", requireExtUser("admin"), async (req, res) => {
  try {
    const uoms = await db.select().from(masterUomsTable).orderBy(masterUomsTable.name);
    res.json(uoms);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/master/uoms
router.post("/master/uoms", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ error: "Kode dan nama wajib diisi" });
    const [uom] = await db.insert(masterUomsTable).values({ code: code.toUpperCase(), name, createdAt: Date.now() }).returning();
    await logAudit(sess.extUserId, "create_uom", "ext_uom", uom.id, `${code.toUpperCase()} - ${name}`);
    res.json({ uom });
  } catch (err) {
    console.error("[create-uom]", err);
    await logAudit((req.session as any)?.extUserId || 0, "create_uom_error", "ext_uom", 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/external/master/uoms/:id
router.put("/master/uoms/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const id = Number(req.params.id);
    const { code, name, isActive } = req.body;
    const updates: any = {};
    if (code !== undefined) updates.code = code.toUpperCase();
    if (name !== undefined) updates.name = name;
    if (isActive !== undefined) updates.isActive = isActive;
    await db.update(masterUomsTable).set(updates).where(eq(masterUomsTable.id, id));
    await logAudit(sess.extUserId, "update_uom", "ext_uom", id, JSON.stringify(updates));
    res.json({ success: true });
  } catch (err) {
    console.error("[update-uom]", err);
    await logAudit((req.session as any)?.extUserId || 0, "update_uom_error", "ext_uom", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/external/master/uoms/:id
router.delete("/master/uoms/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const id = Number(req.params.id);
    await db.update(masterUomsTable).set({ isActive: false }).where(eq(masterUomsTable.id, id));
    await logAudit(sess.extUserId, "delete_uom", "ext_uom", id, `Nonaktifkan UoM ID: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[delete-uom]", err);
    await logAudit((req.session as any)?.extUserId || 0, "delete_uom_error", "ext_uom", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// ─── Master Items ──────────────────────────────────────────────────────────────

// GET /api/external/master/items?q=search
router.get("/master/items", requireExternal(), async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    let items;
    if (q) {
      items = await db.select().from(masterItemsTable)
        .where(and(
          eq(masterItemsTable.isActive, true),
          or(
            ilike(masterItemsTable.name, `%${q}%`),
            ilike(masterItemsTable.code, `%${q}%`),
            ilike(masterItemsTable.description, `%${q}%`)
          )
        ))
        .orderBy(masterItemsTable.name)
        .limit(20);
    } else {
      items = await db.select().from(masterItemsTable)
        .where(eq(masterItemsTable.isActive, true))
        .orderBy(masterItemsTable.name)
        .limit(50);
    }
    res.json(items);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// GET /api/external/master/items/all (admin)
router.get("/master/items/all", requireExtUser("admin"), async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    let items;
    if (q) {
      items = await db.select().from(masterItemsTable)
        .where(or(
          ilike(masterItemsTable.name, `%${q}%`),
          ilike(masterItemsTable.code, `%${q}%`),
          ilike(masterItemsTable.description, `%${q}%`)
        ))
        .orderBy(masterItemsTable.name);
    } else {
      items = await db.select().from(masterItemsTable).orderBy(masterItemsTable.name);
    }
    res.json(items);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// POST /api/external/master/items
router.post("/master/items", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const { code, name, description, defaultUomId } = req.body;
    if (!code || !name) return res.status(400).json({ error: "Kode dan nama wajib diisi" });
    const [item] = await db.insert(masterItemsTable).values({
      code: code.toUpperCase(), name, description: description || null,
      defaultUomId: defaultUomId ? Number(defaultUomId) : null,
      createdAt: Date.now(),
    }).returning();
    await logAudit(sess.extUserId, "create_item", "ext_item", item.id, `${code.toUpperCase()} - ${name}`);
    res.json({ item });
  } catch (err) {
    console.error("[create-item]", err);
    await logAudit((req.session as any)?.extUserId || 0, "create_item_error", "ext_item", 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// PUT /api/external/master/items/:id
router.put("/master/items/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const id = Number(req.params.id);
    const { code, name, description, defaultUomId, isActive } = req.body;
    const updates: any = {};
    if (code !== undefined) updates.code = code.toUpperCase();
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (defaultUomId !== undefined) updates.defaultUomId = defaultUomId ? Number(defaultUomId) : null;
    if (isActive !== undefined) updates.isActive = isActive;
    await db.update(masterItemsTable).set(updates).where(eq(masterItemsTable.id, id));
    await logAudit(sess.extUserId, "update_item", "ext_item", id, JSON.stringify(updates));
    res.json({ success: true });
  } catch (err) {
    console.error("[update-item]", err);
    await logAudit((req.session as any)?.extUserId || 0, "update_item_error", "ext_item", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/external/master/items/:id
router.delete("/master/items/:id", requireExtUser("admin"), async (req, res) => {
  const sess = req.session as any;
  try {
    const id = Number(req.params.id);
    await db.update(masterItemsTable).set({ isActive: false }).where(eq(masterItemsTable.id, id));
    await logAudit(sess.extUserId, "delete_item", "ext_item", id, `Nonaktifkan item ID: ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[delete-item]", err);
    await logAudit((req.session as any)?.extUserId || 0, "delete_item_error", "ext_item", Number(req.params.id) || 0, String(err));
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/external/master/items/import-csv  (admin, CSV body as text)
router.post("/master/items/import-csv", requireExtUser("admin"), async (req, res) => {
  try {
    const { csvText } = req.body;
    if (!csvText) return res.status(400).json({ error: "CSV kosong" });

    const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim());
    // Skip header row if starts with non-numeric (code, name...)
    const dataLines = lines[0]?.toLowerCase().includes("code") ? lines.slice(1) : lines;

    const uoms = await db.select().from(masterUomsTable);
    // Lookup UoM by code (KG) OR by name (Kilogram) — case-insensitive
    const uomLookup: Record<string, number> = {};
    for (const u of uoms) {
      uomLookup[u.code.toLowerCase()] = u.id;
      uomLookup[u.name.toLowerCase()] = u.id;
    }

    const resolveUomId = (cols: string[]): number | null => {
      // Try col[3], then col[4], then col[5] — first non-empty wins
      for (let i = 3; i <= 5; i++) {
        const v = (cols[i] || "").trim().replace(/^"|"$/g, "");
        if (v) return uomLookup[v.toLowerCase()] ?? null;
      }
      return null;
    };

    let imported = 0; let skipped = 0; let updated = 0;
    for (const line of dataLines) {
      const cols = line.split(",").map((c: string) => c.trim().replace(/^"|"$/g, ""));
      // Format: code, name, description (opt), uom (opt — by code or name, may be in col 3 or 4+)
      const [code, name, description] = cols;
      if (!code || !name) { skipped++; continue; }
      const defaultUomId = resolveUomId(cols);
      const existing = await db.select({ id: masterItemsTable.id })
        .from(masterItemsTable).where(eq(masterItemsTable.code, code.toUpperCase())).limit(1);
      if (existing.length > 0) {
        // Update description and defaultUomId on re-import
        await db.update(masterItemsTable).set({
          name, description: description || null,
          ...(defaultUomId !== null ? { defaultUomId } : {}),
        }).where(eq(masterItemsTable.code, code.toUpperCase()));
        updated++;
      } else {
        await db.insert(masterItemsTable).values({
          code: code.toUpperCase(), name, description: description || null,
          defaultUomId, isActive: true, createdAt: Date.now(),
        });
        imported++;
      }
    }
    const sess = req.session as any;
    await logAudit(sess.extUserId, "import_items_csv", "ext_item", 0,
      `Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`);
    res.json({ imported, updated, skipped });
  } catch (err) {
    console.error("[import-csv]", err);
    const sess = (req as any).session as any;
    await logAudit(sess?.extUserId || 0, "import_items_csv_error", "ext_item", 0, String(err));
    res.status(500).json({ error: "Gagal import CSV" });
  }
});

// GET /api/external/invoice-items/:invoiceId
router.get("/invoice-items/:invoiceId", requireExternal(), async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId);
    const items = await db.select().from(vendorInvoiceItemsTable)
      .where(eq(vendorInvoiceItemsTable.invoiceId, invoiceId));
    res.json(items);
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

// PUT /api/external/invoices/:id — edit invoice items (only if status = pending)
router.put("/invoices/:id", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const invoiceId = Number(req.params.id);
    const [inv] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, invoiceId));
    if (!inv) return res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (inv.vendorCompanyId !== sess.vendorId) return res.status(403).json({ error: "Forbidden" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invoice hanya bisa diedit saat status Menunggu" });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Minimal satu item harus diisi" });

    let totalCalc = 0;
    for (const item of items) {
      if (!item.itemId || !item.uomId || !item.qty || item.pricePerUom === undefined) {
        return res.status(400).json({ error: "Data item tidak lengkap (itemId, uomId, qty, pricePerUom wajib)" });
      }
      const qty = Number(item.qty);
      const price = Number(item.pricePerUom);
      if (qty <= 0 || price < 0) return res.status(400).json({ error: "Qty dan harga harus bernilai positif" });
      totalCalc += qty * price;
    }
    const totalInvoice = String(Math.round(totalCalc));

    await db.delete(vendorInvoiceItemsTable).where(eq(vendorInvoiceItemsTable.invoiceId, invoiceId));
    for (const item of items) {
      const qty = Number(item.qty);
      const price = Number(item.pricePerUom);
      await db.insert(vendorInvoiceItemsTable).values({
        invoiceId,
        itemId: Number(item.itemId),
        itemCode: item.itemCode || "",
        itemName: item.itemName || "",
        uomId: Number(item.uomId),
        uomName: item.uomName || "",
        qty: String(qty),
        pricePerUom: String(price),
        subtotal: String(qty * price),
      });
    }

    const [updated] = await db.update(vendorInvoicesTable)
      .set({ totalInvoice, updatedAt: Date.now() })
      .where(eq(vendorInvoicesTable.id, invoiceId))
      .returning();

    await logAudit(sess.vendorId, "edit_invoice", "ext_invoice", invoiceId,
      `Total: ${totalInvoice}, Items: ${items.length}`);
    res.json({ success: true, invoice: updated });
  } catch (err) {
    console.error("[edit-invoice]", err);
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// DELETE /api/external/invoices/:id — delete invoice (only if status = pending)
router.delete("/invoices/:id", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const invoiceId = Number(req.params.id);
    const [inv] = await db.select().from(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, invoiceId));
    if (!inv) return res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (inv.vendorCompanyId !== sess.vendorId) return res.status(403).json({ error: "Forbidden" });
    if (inv.status !== "pending") return res.status(400).json({ error: "Invoice hanya bisa dihapus saat status Menunggu" });

    await db.delete(vendorInvoiceItemsTable).where(eq(vendorInvoiceItemsTable.invoiceId, invoiceId));
    await db.delete(vendorInvoicesTable).where(eq(vendorInvoicesTable.id, invoiceId));

    await logAudit(sess.vendorId, "delete_invoice", "ext_invoice", invoiceId, `PO: ${inv.poNumber}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[delete-invoice]", err);
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/external/profile — get current vendor profile including bank info
router.get("/profile", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    const [vendor] = await db.select({
      id: vendorCompaniesTable.id,
      companyName: vendorCompaniesTable.companyName,
      email: vendorCompaniesTable.email,
      picName: vendorCompaniesTable.picName,
      picPhone: vendorCompaniesTable.picPhone,
      officePhone: vendorCompaniesTable.officePhone,
      companyAddress: vendorCompaniesTable.companyAddress,
      bankName: vendorCompaniesTable.bankName,
      bankAccount: vendorCompaniesTable.bankAccount,
      bankAccountName: vendorCompaniesTable.bankAccountName,
    }).from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });

    const [pendingReq] = await db.select().from(vendorBankChangeRequestsTable)
      .where(and(
        eq(vendorBankChangeRequestsTable.vendorCompanyId, sess.vendorId),
        eq(vendorBankChangeRequestsTable.status, "pending")
      ))
      .orderBy(desc(vendorBankChangeRequestsTable.createdAt))
      .limit(1);

    res.json({ ...vendor, pendingBankChangeRequest: pendingReq || null });
  } catch (err) {
    console.error("[get-profile]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/external/profile/bank-change-request — vendor submits bank change request
router.post("/profile/bank-change-request", requireVendor(), async (req, res) => {
  try {
    const sess = req.session as any;
    if ((sess.vendorStatus || "") !== "active") return res.status(403).json({ error: "Akun vendor belum aktif" });

    const [vendor] = await db.select().from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, sess.vendorId));
    if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });

    const { bankName, bankAccount, bankAccountName } = req.body;
    if (!bankName?.trim() || !bankAccount?.trim() || !bankAccountName?.trim()) {
      return res.status(400).json({ error: "Semua field rekening wajib diisi" });
    }

    const existing = await db.select().from(vendorBankChangeRequestsTable)
      .where(and(
        eq(vendorBankChangeRequestsTable.vendorCompanyId, sess.vendorId),
        eq(vendorBankChangeRequestsTable.status, "pending")
      ));
    if (existing.length > 0) {
      return res.status(400).json({ error: "Masih ada permintaan perubahan rekening yang belum disetujui" });
    }

    const [newReq] = await db.insert(vendorBankChangeRequestsTable).values({
      vendorCompanyId: sess.vendorId,
      vendorCompanyName: vendor.companyName,
      bankName: bankName.trim(),
      bankAccount: bankAccount.trim(),
      bankAccountName: bankAccountName.trim(),
      status: "pending",
      createdAt: Date.now(),
    }).returning();

    try {
      const users = await db.select().from(externalUsersTable).where(eq(externalUsersTable.isActive, true));
      for (const u of users) {
        if (u.email) {
          await sendEmail(u.email, `Permintaan Ubah Rekening: ${vendor.companyName} - ProcureFlow`,
            `<div style="font-family:Arial,sans-serif;max-width:480px">
              <h3 style="color:#1e40af">Permintaan Ubah Nomor Rekening</h3>
              <p>Vendor <b>${vendor.companyName}</b> mengajukan perubahan data rekening bank.</p>
              <table style="border-collapse:collapse;width:100%">
                <tr><td style="padding:4px 8px;color:#6b7280">Bank</td><td style="padding:4px 8px"><b>${bankName}</b></td></tr>
                <tr><td style="padding:4px 8px;color:#6b7280">No. Rekening</td><td style="padding:4px 8px"><b>${bankAccount}</b></td></tr>
                <tr><td style="padding:4px 8px;color:#6b7280">Atas Nama</td><td style="padding:4px 8px"><b>${bankAccountName}</b></td></tr>
              </table>
              <p>Silakan login ke sistem untuk menyetujui atau menolak permintaan ini.</p>
            </div>`
          );
        }
      }
    } catch (e) { console.error("Notify bank change error:", e); }

    await logAudit(sess.vendorId, "bank_change_request", "ext_bank_request", newReq.id,
      `Bank: ${bankName}, No: ${bankAccount}, A/N: ${bankAccountName}`);
    res.json({ success: true, request: newReq });
  } catch (err) {
    console.error("[bank-change-request]", err);
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// GET /api/external/bank-change-requests/count — count pending (any logged-in internal user)
router.get("/bank-change-requests/count", requireExternal(), async (req, res) => {
  try {
    const sess = req.session as any;
    if (sess.vendorId) return res.json({ count: 0 });
    const [result] = await db.select({ count: sql`count(*)::int` })
      .from(vendorBankChangeRequestsTable)
      .where(eq(vendorBankChangeRequestsTable.status, "pending"));
    res.json({ count: result?.count || 0 });
  } catch { res.json({ count: 0 }); }
});

// GET /api/external/bank-change-requests — list (internal user)
router.get("/bank-change-requests", requireExtUser(), async (req, res) => {
  try {
    const { status } = req.query;
    const conditions: any[] = [];
    if (status) conditions.push(eq(vendorBankChangeRequestsTable.status, status as string));
    const requests = await db.select().from(vendorBankChangeRequestsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(vendorBankChangeRequestsTable.createdAt));
    res.json(requests);
  } catch (err) {
    console.error("[bank-change-requests]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/external/bank-change-requests/:id/status — approve or reject
router.patch("/bank-change-requests/:id/status", requireExtUser(), async (req, res) => {
  try {
    const sess = req.session as any;
    const id = Number(req.params.id);
    const { status, notes } = req.body;
    if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Status tidak valid" });

    const [changeReq] = await db.select().from(vendorBankChangeRequestsTable)
      .where(eq(vendorBankChangeRequestsTable.id, id));
    if (!changeReq) return res.status(404).json({ error: "Permintaan tidak ditemukan" });
    if (changeReq.status !== "pending") return res.status(400).json({ error: "Permintaan sudah diproses" });

    const [updated] = await db.update(vendorBankChangeRequestsTable).set({
      status,
      notes: notes || null,
      reviewedBy: sess.extUsername,
      reviewedAt: Date.now(),
    }).where(eq(vendorBankChangeRequestsTable.id, id)).returning();

    if (status === "approved") {
      await db.update(vendorCompaniesTable).set({
        bankName: changeReq.bankName,
        bankAccount: changeReq.bankAccount,
        bankAccountName: changeReq.bankAccountName,
      }).where(eq(vendorCompaniesTable.id, changeReq.vendorCompanyId));
    }

    try {
      const [vendor] = await db.select().from(vendorCompaniesTable)
        .where(eq(vendorCompaniesTable.id, changeReq.vendorCompanyId));
      if (vendor?.email) {
        const statusLabel = status === "approved" ? "Disetujui" : "Ditolak";
        await sendEmail(vendor.email, `Permintaan Ubah Rekening ${statusLabel} - ProcureFlow`,
          `<div style="font-family:Arial,sans-serif;max-width:480px">
            <h3 style="color:${status === "approved" ? "#15803d" : "#dc2626"}">Permintaan Ubah Rekening ${statusLabel}</h3>
            <p>Halo <b>${vendor.picName}</b>,</p>
            <p>Permintaan perubahan nomor rekening Anda telah <b>${statusLabel.toLowerCase()}</b>.</p>
            ${status === "approved" ? `
            <table style="border-collapse:collapse;width:100%">
              <tr><td style="padding:4px 8px;color:#6b7280">Bank</td><td style="padding:4px 8px"><b>${changeReq.bankName}</b></td></tr>
              <tr><td style="padding:4px 8px;color:#6b7280">No. Rekening</td><td style="padding:4px 8px"><b>${changeReq.bankAccount}</b></td></tr>
              <tr><td style="padding:4px 8px;color:#6b7280">Atas Nama</td><td style="padding:4px 8px"><b>${changeReq.bankAccountName}</b></td></tr>
            </table>` : ""}
            ${notes ? `<p><b>Catatan:</b> ${notes}</p>` : ""}
          </div>`
        );
      }
    } catch (e) { console.error("Notify bank change status error:", e); }

    await logAudit(sess.extUserId, `bank_change_${status}`, "ext_bank_request", id,
      `Vendor: ${changeReq.vendorCompanyName}, Status: ${status}`);
    res.json({ success: true, request: updated });
  } catch (err) {
    console.error("[bank-change-status]", err);
    res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

// ─── External Purchase Orders (Admin) ─────────────────────────────────────────

// GET /api/external/pos — list all POs with vendor info
router.get("/pos", requireExtUser("admin"), async (req: any, res) => {
  try {
    const pos = await db.select().from(externalPurchaseOrdersTable)
      .orderBy(desc(externalPurchaseOrdersTable.createdAt));
    const vendorIds = [...new Set(pos.map(p => p.vendorCompanyId))];
    let vendors: any[] = [];
    if (vendorIds.length > 0) {
      vendors = await db.select({ id: vendorCompaniesTable.id, companyName: vendorCompaniesTable.companyName })
        .from(vendorCompaniesTable);
    }
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.companyName]));
    const result = pos.map(p => ({
      ...p, vendorName: vendorMap[p.vendorCompanyId] || "—",
    }));
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/external/pos — create PO
router.post("/pos", requireExtUser("admin"), async (req: any, res) => {
  const sess = req.session as any;
  const { poNumber, vendorCompanyId, notes, items } = req.body;
  if (!poNumber || !vendorCompanyId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "poNumber, vendorCompanyId, dan items wajib diisi." });
  }
  const now = Date.now();
  try {
    const [po] = await db.insert(externalPurchaseOrdersTable).values({
      poNumber, vendorCompanyId: Number(vendorCompanyId), status: "active",
      notes: notes || null, createdBy: sess.extUsername || "admin", createdAt: now, updatedAt: now,
    }).returning();
    // Insert items
    if (items.length > 0) {
      await db.insert(externalPoItemsTable).values(items.map((it: any) => ({
        poId: po.id,
        itemId: it.itemId ? Number(it.itemId) : null,
        itemCode: it.itemCode, itemName: it.itemName,
        uomId: it.uomId ? Number(it.uomId) : null,
        uomCode: it.uomCode, uomName: it.uomName,
        qty: String(it.qty), unitPrice: String(it.unitPrice),
        subtotal: String(Number(it.qty) * Number(it.unitPrice)),
      })));
    }
    await logAudit(sess.extUserId, "create_po", "external_purchase_orders", po.id,
      `PO: ${poNumber}, Vendor: ${vendorCompanyId}`);
    const poItems = await db.select().from(externalPoItemsTable).where(eq(externalPoItemsTable.poId, po.id));
    res.json({ success: true, po: { ...po, items: poItems } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/external/pos/:id — get PO detail with items
router.get("/pos/:id", requireExternal(), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const [po] = await db.select().from(externalPurchaseOrdersTable)
      .where(eq(externalPurchaseOrdersTable.id, id));
    if (!po) return res.status(404).json({ error: "PO tidak ditemukan." });
    // Vendor can only see their own PO
    const sess = req.session as any;
    if (sess.extVendorId && po.vendorCompanyId !== sess.extVendorId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const items = await db.select().from(externalPoItemsTable).where(eq(externalPoItemsTable.poId, id));
    const [vendor] = await db.select({ companyName: vendorCompaniesTable.companyName })
      .from(vendorCompaniesTable).where(eq(vendorCompaniesTable.id, po.vendorCompanyId));
    res.json({ ...po, vendorName: vendor?.companyName || "—", items });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PUT /api/external/pos/:id — update PO (admin only, only if no pending change request)
router.put("/pos/:id", requireExtUser("admin"), async (req: any, res) => {
  const sess = req.session as any;
  const id = Number(req.params.id);
  const { poNumber, vendorCompanyId, notes, items, status } = req.body;
  try {
    const [existing] = await db.select().from(externalPurchaseOrdersTable)
      .where(eq(externalPurchaseOrdersTable.id, id));
    if (!existing) return res.status(404).json({ error: "PO tidak ditemukan." });
    const updates: any = { updatedAt: Date.now() };
    if (poNumber) updates.poNumber = poNumber;
    if (vendorCompanyId) updates.vendorCompanyId = Number(vendorCompanyId);
    if (notes !== undefined) updates.notes = notes;
    if (status) updates.status = status;
    const [updated] = await db.update(externalPurchaseOrdersTable).set(updates)
      .where(eq(externalPurchaseOrdersTable.id, id)).returning();
    if (Array.isArray(items)) {
      await db.delete(externalPoItemsTable).where(eq(externalPoItemsTable.poId, id));
      if (items.length > 0) {
        await db.insert(externalPoItemsTable).values(items.map((it: any) => ({
          poId: id, itemId: it.itemId ? Number(it.itemId) : null,
          itemCode: it.itemCode, itemName: it.itemName,
          uomId: it.uomId ? Number(it.uomId) : null,
          uomCode: it.uomCode, uomName: it.uomName,
          qty: String(it.qty), unitPrice: String(it.unitPrice),
          subtotal: String(Number(it.qty) * Number(it.unitPrice)),
        })));
      }
    }
    await logAudit(sess.extUserId, "update_po", "external_purchase_orders", id, `PO: ${updated.poNumber}`);
    const updatedItems = await db.select().from(externalPoItemsTable).where(eq(externalPoItemsTable.poId, id));
    res.json({ success: true, po: { ...updated, items: updatedItems } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/external/pos/:id — close/delete PO
router.delete("/pos/:id", requireExtUser("admin"), async (req: any, res) => {
  const sess = req.session as any;
  const id = Number(req.params.id);
  try {
    const [updated] = await db.update(externalPurchaseOrdersTable)
      .set({ status: "closed", updatedAt: Date.now() })
      .where(eq(externalPurchaseOrdersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "PO tidak ditemukan." });
    await logAudit(sess.extUserId, "close_po", "external_purchase_orders", id, `PO: ${updated.poNumber}`);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Vendor: My POs ───────────────────────────────────────────────────────────

// GET /api/external/my-pos — vendor's POs
router.get("/my-pos", requireVendor(), async (req: any, res) => {
  const sess = req.session as any;
  try {
    const pos = await db.select().from(externalPurchaseOrdersTable)
      .where(eq(externalPurchaseOrdersTable.vendorCompanyId, sess.extVendorId))
      .orderBy(desc(externalPurchaseOrdersTable.createdAt));
    res.json(pos);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── PO Change Requests (Vendor → Admin) ─────────────────────────────────────

// POST /api/external/pos/:id/change-request — vendor submits change request
router.post("/pos/:id/change-request", requireVendor(), async (req: any, res) => {
  const sess = req.session as any;
  const poId = Number(req.params.id);
  try {
    const [po] = await db.select().from(externalPurchaseOrdersTable)
      .where(and(eq(externalPurchaseOrdersTable.id, poId),
        eq(externalPurchaseOrdersTable.vendorCompanyId, sess.extVendorId)));
    if (!po) return res.status(404).json({ error: "PO tidak ditemukan." });
    if (po.status === "closed") return res.status(400).json({ error: "PO sudah ditutup." });

    const { notes, items, suratJalan } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items perubahan wajib diisi." });
    }

    // Upload surat jalan if provided
    let suratJalanUrl: string | null = null;
    let suratJalanFilename: string | null = null;
    if (suratJalan?.data && suratJalan?.filename) {
      try {
        const buf = Buffer.from(suratJalan.data.replace(/^data:[^;]+;base64,/, ""), "base64");
        const mime = guessMimeType(suratJalan.filename);
        const result = await uploadToGoogleDrive(buf, suratJalan.filename, mime, "surat-jalan");
        suratJalanUrl = result.webViewLink || result.id;
        suratJalanFilename = suratJalan.filename;
      } catch (e) { console.error("Surat jalan upload error:", e); }
    }

    const now = Date.now();
    const [changeReq] = await db.insert(externalPoChangeRequestsTable).values({
      poId, vendorCompanyId: sess.extVendorId, status: "pending",
      notes: notes || null, suratJalanUrl, suratJalanFilename,
      createdAt: now,
    }).returning();

    // Insert change items
    await db.insert(externalPoChangeItemsTable).values(items.map((it: any) => ({
      changeRequestId: changeReq.id,
      itemId: it.itemId ? Number(it.itemId) : null,
      itemCode: it.itemCode, itemName: it.itemName,
      uomId: it.uomId ? Number(it.uomId) : null,
      uomCode: it.uomCode, uomName: it.uomName,
      qty: String(it.qty), unitPrice: String(it.unitPrice),
      subtotal: String(Number(it.qty) * Number(it.unitPrice)),
    })));

    // Mark PO as under revision
    await db.update(externalPurchaseOrdersTable)
      .set({ status: "revision", updatedAt: now })
      .where(eq(externalPurchaseOrdersTable.id, poId));

    await logAudit(sess.extVendorId, "po_change_request", "external_po_change_requests",
      changeReq.id, `PO: ${po.poNumber}, Vendor: ${sess.extVendorId}`);
    res.json({ success: true, changeRequest: changeReq });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/external/po-change-requests — list all (admin)
router.get("/po-change-requests", requireExtUser("admin"), async (req: any, res) => {
  try {
    const reqs = await db.select().from(externalPoChangeRequestsTable)
      .orderBy(desc(externalPoChangeRequestsTable.createdAt));
    const poIds = [...new Set(reqs.map(r => r.poId))];
    const vendorIds = [...new Set(reqs.map(r => r.vendorCompanyId))];
    const [pos, vendors] = await Promise.all([
      poIds.length > 0 ? db.select({ id: externalPurchaseOrdersTable.id, poNumber: externalPurchaseOrdersTable.poNumber })
        .from(externalPurchaseOrdersTable) : Promise.resolve([]),
      vendorIds.length > 0 ? db.select({ id: vendorCompaniesTable.id, companyName: vendorCompaniesTable.companyName })
        .from(vendorCompaniesTable) : Promise.resolve([]),
    ]);
    const poMap = Object.fromEntries(pos.map(p => [p.id, p.poNumber]));
    const vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.companyName]));
    const result = await Promise.all(reqs.map(async r => {
      const items = await db.select().from(externalPoChangeItemsTable)
        .where(eq(externalPoChangeItemsTable.changeRequestId, r.id));
      return { ...r, poNumber: poMap[r.poId] || "—", vendorName: vendorMap[r.vendorCompanyId] || "—", items };
    }));
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// GET /api/external/po-change-requests/count — pending count (admin)
router.get("/po-change-requests/count", requireExtUser("admin"), async (_req, res) => {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` })
      .from(externalPoChangeRequestsTable)
      .where(eq(externalPoChangeRequestsTable.status, "pending"));
    res.json({ count: row?.count || 0 });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/external/po-change-requests/:id/status — admin approves or rejects
router.patch("/po-change-requests/:id/status", requireExtUser("admin"), async (req: any, res) => {
  const sess = req.session as any;
  const id = Number(req.params.id);
  const { status, reviewNotes } = req.body;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status harus 'approved' atau 'rejected'." });
  }
  try {
    const [changeReq] = await db.select().from(externalPoChangeRequestsTable)
      .where(eq(externalPoChangeRequestsTable.id, id));
    if (!changeReq) return res.status(404).json({ error: "Change request tidak ditemukan." });
    if (changeReq.status !== "pending") {
      return res.status(400).json({ error: "Change request sudah diproses." });
    }
    const now = Date.now();
    const [updated] = await db.update(externalPoChangeRequestsTable)
      .set({ status, reviewedBy: sess.extUsername || "admin", reviewedAt: now, reviewNotes: reviewNotes || null })
      .where(eq(externalPoChangeRequestsTable.id, id)).returning();

    if (status === "approved") {
      // Apply change items to PO items
      const changeItems = await db.select().from(externalPoChangeItemsTable)
        .where(eq(externalPoChangeItemsTable.changeRequestId, id));
      await db.delete(externalPoItemsTable).where(eq(externalPoItemsTable.poId, changeReq.poId));
      if (changeItems.length > 0) {
        await db.insert(externalPoItemsTable).values(changeItems.map(it => ({
          poId: changeReq.poId, itemId: it.itemId, itemCode: it.itemCode, itemName: it.itemName,
          uomId: it.uomId, uomCode: it.uomCode, uomName: it.uomName,
          qty: it.qty, unitPrice: it.unitPrice, subtotal: it.subtotal,
        })));
      }
      // Set PO back to active
      await db.update(externalPurchaseOrdersTable)
        .set({ status: "active", updatedAt: now })
        .where(eq(externalPurchaseOrdersTable.id, changeReq.poId));
    } else {
      // Rejected — restore PO to active
      await db.update(externalPurchaseOrdersTable)
        .set({ status: "active", updatedAt: now })
        .where(eq(externalPurchaseOrdersTable.id, changeReq.poId));
    }

    await logAudit(sess.extUserId, `po_change_${status}`, "external_po_change_requests", id,
      `PO ID: ${changeReq.poId}, Status: ${status}`);
    res.json({ success: true, changeRequest: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Admin: API Key Management ─────────────────────────────────────────────────

// GET /api/external/admin/api-keys
router.get("/admin/api-keys", requireExtUser("admin"), async (req: any, res) => {
  try {
    const keys = await db.select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      permissions: apiKeysTable.permissions,
      isActive: apiKeysTable.isActive,
      createdBy: apiKeysTable.createdBy,
      createdAt: apiKeysTable.createdAt,
      lastUsedAt: apiKeysTable.lastUsedAt,
    }).from(apiKeysTable).orderBy(desc(apiKeysTable.createdAt));
    res.json(keys);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// POST /api/external/admin/api-keys — create a new key (returns raw key ONCE)
router.post("/admin/api-keys", requireExtUser("admin"), async (req: any, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nama wajib diisi" });
    const perms: string[] = Array.isArray(permissions) ? permissions : [];
    if (perms.length === 0) return res.status(400).json({ error: "Pilih minimal satu izin akses" });

    const raw = "pf_" + crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(raw).digest("hex");
    const keyPrefix = raw.slice(0, 10);
    const sess = req.session as any;

    const [inserted] = await db.insert(apiKeysTable).values({
      name: name.trim(),
      keyHash,
      keyPrefix,
      permissions: perms,
      isActive: true,
      createdBy: sess.extUsername || "admin",
      createdAt: Date.now(),
    }).returning();

    await logAudit(sess.extUserId, "api_key_created", "api_keys", inserted.id, name.trim());
    res.json({ success: true, rawKey: raw, apiKey: { ...inserted, keyHash: undefined } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/external/admin/api-keys/:id/toggle — activate/deactivate
router.patch("/admin/api-keys/:id/toggle", requireExtUser("admin"), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id));
    if (!existing) return res.status(404).json({ error: "API key tidak ditemukan" });
    const [updated] = await db.update(apiKeysTable)
      .set({ isActive: !existing.isActive })
      .where(eq(apiKeysTable.id, id)).returning();
    const sess = req.session as any;
    await logAudit(sess.extUserId, `api_key_${updated.isActive ? "activated" : "deactivated"}`, "api_keys", id, existing.name);
    res.json({ success: true, apiKey: updated });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/external/admin/api-keys/:id
router.delete("/admin/api-keys/:id", requireExtUser("admin"), async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(apiKeysTable).where(eq(apiKeysTable.id, id));
    if (!existing) return res.status(404).json({ error: "API key tidak ditemukan" });
    await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
    const sess = req.session as any;
    await logAudit(sess.extUserId, "api_key_deleted", "api_keys", id, existing.name);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
