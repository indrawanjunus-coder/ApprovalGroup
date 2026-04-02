import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, companiesTable, companyLeaveSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import nodemailer from "nodemailer";
import { handleRouteError } from "../lib/audit.js";

const router = Router();

// Public endpoint - no auth required (must be before requireAuth middleware)
router.get("/public", async (req, res) => {
  try {
    const [landingPageImageUrl, landingPageStyle, logoUrl, landingHeading, landingSubtitle, appName] = await Promise.all([
      getSettingValue("landing_page_image_url"),
      getSettingValue("landing_page_style"),
      getSettingValue("logo_url"),
      getSettingValue("landing_heading"),
      getSettingValue("landing_subtitle"),
      getSettingValue("app_name"),
    ]);
    res.json({
      landingPageImageUrl: landingPageImageUrl || null,
      landingPageStyle: landingPageStyle || "image",
      logoUrl: logoUrl || null,
      landingHeading: landingHeading || null,
      landingSubtitle: landingSubtitle || null,
      appName: appName || null,
    });
  } catch {
    res.json({ landingPageImageUrl: null, landingPageStyle: "image", logoUrl: null, landingHeading: null, landingSubtitle: null, appName: null });
  }
});

router.use(requireAuth);

const DEFAULT_SETTINGS = {
  poEnabled: "true",
  companyName: "PT. Perusahaan Indonesia",
  currency: "IDR",
};

async function getSettingValue(key: string): Promise<string> {
  const [setting] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return setting?.value ?? DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] ?? "";
}

async function upsertSetting(key: string, value: string) {
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

router.get("/", async (req, res) => {
  try {
    const [poEnabled, companyName, currency] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
    ]);
    res.json({ poEnabled: poEnabled === "true", companyName, currency });
  } catch (err) { handleRouteError(res, err); }
});

router.put("/", requireRole("admin"), async (req, res) => {
  const { poEnabled, companyName, currency } = req.body;
  try {
    if (poEnabled !== undefined) await upsertSetting("poEnabled", String(poEnabled));
    if (companyName !== undefined) await upsertSetting("companyName", companyName);
    if (currency !== undefined) await upsertSetting("currency", currency);

    const [poEnabledVal, companyNameVal, currencyVal] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
    ]);
    res.json({ poEnabled: poEnabledVal === "true", companyName: companyNameVal, currency: currencyVal });
  } catch (err) { handleRouteError(res, err); }
});

// SMTP settings
router.get("/smtp", requireRole("admin"), async (req, res) => {
  try {
    const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_security", "smtp_from"];
    const rows = await Promise.all(keys.map(k => getSettingValue(k)));
    res.json({
      smtpHost: rows[0],
      smtpPort: rows[1] ? parseInt(rows[1]) : 587,
      smtpUser: rows[2],
      smtpPassword: rows[3],
      smtpSecurity: rows[4] || "STARTTLS",
      smtpFrom: rows[5],
    });
  } catch (err) { handleRouteError(res, err); }
});

router.put("/smtp", requireRole("admin"), async (req, res) => {
  const { smtpHost, smtpPort, smtpUser, smtpPassword, smtpSecurity, smtpFrom } = req.body;
  try {
    if (smtpHost !== undefined) await upsertSetting("smtp_host", smtpHost);
    if (smtpPort !== undefined) await upsertSetting("smtp_port", String(smtpPort));
    if (smtpUser !== undefined) await upsertSetting("smtp_user", smtpUser);
    if (smtpPassword !== undefined) await upsertSetting("smtp_password", smtpPassword);
    if (smtpSecurity !== undefined) await upsertSetting("smtp_security", smtpSecurity);
    if (smtpFrom !== undefined) await upsertSetting("smtp_from", smtpFrom);

    const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_security", "smtp_from"];
    const rows = await Promise.all(keys.map(k => getSettingValue(k)));
    res.json({
      smtpHost: rows[0],
      smtpPort: rows[1] ? parseInt(rows[1]) : 587,
      smtpUser: rows[2],
      smtpPassword: rows[3],
      smtpSecurity: rows[4] || "STARTTLS",
      smtpFrom: rows[5],
    });
  } catch (err) { handleRouteError(res, err); }
});

// SMTP test email
router.post("/smtp/test", requireRole("admin"), async (req, res) => {
  try {
    const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_security", "smtp_from"];
    const rows = await Promise.all(keys.map(k => getSettingValue(k)));
    const host = rows[0];
    const port = rows[1] ? parseInt(rows[1]) : 587;
    const user = rows[2];
    const pass = rows[3];
    const security = rows[4] || "STARTTLS";
    const from = rows[5] || user;

    if (!host || !user || !pass) {
      return res.status(400).json({ error: "SMTP belum dikonfigurasi. Simpan pengaturan SMTP terlebih dahulu." });
    }

    const { to } = req.body;
    const recipient = to || user;

    const secure = security === "SSL";
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: security === "STARTTLS" ? { rejectUnauthorized: false } : undefined,
    });

    await transporter.sendMail({
      from: `"ProcureFlow System" <${from}>`,
      to: recipient,
      subject: "Test Email — ProcureFlow",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#2563eb;margin-top:0">✅ Konfigurasi Email Berhasil</h2>
          <p>Email ini dikirim sebagai pengujian konfigurasi SMTP ProcureFlow.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
            <tr><td style="padding:6px 12px;background:#f8fafc;font-weight:600;border-radius:4px">Host</td><td style="padding:6px 12px">${host}:${port}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;font-weight:600;border-radius:4px">Enkripsi</td><td style="padding:6px 12px">${security}</td></tr>
            <tr><td style="padding:6px 12px;background:#f8fafc;font-weight:600;border-radius:4px">Pengirim</td><td style="padding:6px 12px">${from}</td></tr>
          </table>
          <p style="color:#64748b;font-size:13px">Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
        </div>
      `,
    });

    res.json({ success: true, message: `Email test berhasil dikirim ke ${recipient}` });
  } catch (err: any) {
    console.error("[SMTP Test]", err);
    res.status(500).json({ error: `Gagal kirim email: ${err.message || "Unknown error"}` });
  }
});

// Company leave settings
router.get("/company-leave", async (req, res) => {
  try {
    const companies = await db.select().from(companiesTable);
    const settings = await db.select().from(companyLeaveSettingsTable);
    const settingMap = new Map(settings.map(s => [s.companyId, s]));
    const result = companies.map(c => {
      const s = settingMap.get(c.id);
      return {
        companyId: c.id,
        companyName: c.name,
        carryoverExpiryMonth: s?.carryoverExpiryMonth ?? 3,
        carryoverExpiryDay: s?.carryoverExpiryDay ?? 31,
        maxCarryoverDays: s?.maxCarryoverDays ?? 12,
        accrualDaysPerMonth: s ? parseFloat(s.accrualDaysPerMonth) : 1,
        settingId: s?.id || null,
      };
    });
    res.json(result);
  } catch (err) { handleRouteError(res, err); }
});

router.put("/company-leave/:companyId", requireRole("admin"), async (req, res) => {
  const companyId = parseInt(req.params.companyId);
  const { carryoverExpiryMonth, carryoverExpiryDay, maxCarryoverDays, accrualDaysPerMonth } = req.body;
  try {
    const [company] = await db.select({ id: companiesTable.id, name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, companyId));
    if (!company) { res.status(404).json({ error: "Company not found" }); return; }

    const existing = await db.select().from(companyLeaveSettingsTable).where(eq(companyLeaveSettingsTable.companyId, companyId));
    let result: any;
    if (existing.length > 0) {
      const update: any = { updatedAt: new Date() };
      if (carryoverExpiryMonth !== undefined) update.carryoverExpiryMonth = carryoverExpiryMonth;
      if (carryoverExpiryDay !== undefined) update.carryoverExpiryDay = carryoverExpiryDay;
      if (maxCarryoverDays !== undefined) update.maxCarryoverDays = maxCarryoverDays;
      if (accrualDaysPerMonth !== undefined) update.accrualDaysPerMonth = String(accrualDaysPerMonth);
      [result] = await db.update(companyLeaveSettingsTable).set(update).where(eq(companyLeaveSettingsTable.companyId, companyId)).returning();
    } else {
      [result] = await db.insert(companyLeaveSettingsTable).values({
        companyId,
        carryoverExpiryMonth: carryoverExpiryMonth ?? 3,
        carryoverExpiryDay: carryoverExpiryDay ?? 31,
        maxCarryoverDays: maxCarryoverDays ?? 12,
        accrualDaysPerMonth: String(accrualDaysPerMonth ?? 1),
      }).returning();
    }
    res.json({
      companyId: result.companyId,
      companyName: company.name,
      carryoverExpiryMonth: result.carryoverExpiryMonth,
      carryoverExpiryDay: result.carryoverExpiryDay,
      maxCarryoverDays: result.maxCarryoverDays,
      accrualDaysPerMonth: parseFloat(result.accrualDaysPerMonth),
      settingId: result.id,
    });
  } catch (err) { handleRouteError(res, err); }
});

// Duty Meal settings
router.get("/duty-meal", async (req, res) => {
  try {
    const keys = [
      "duty_meal_enabled", "duty_meal_company_id", "duty_meal_lock_date",
      "duty_meal_bank_account_number", "duty_meal_bank_account_name", "duty_meal_bank_name",
      "duty_meal_gdrive_folder", "duty_meal_gdrive_email", "duty_meal_gdrive_private_key",
      "duty_meal_min_months", "duty_meal_unpaid_lock", "duty_meal_unpaid_months",
    ];
    const rows = await Promise.all(keys.map(k => getSettingValue(k)));
    res.json({
      dutyMealEnabled: rows[0] === "true",
      dutyMealCompanyId: rows[1] ? parseInt(rows[1]) : null,
      dutyMealLockDate: rows[2] ? parseInt(rows[2]) : 10,
      dutyMealBankAccountNumber: rows[3] || "",
      dutyMealBankAccountName: rows[4] || "",
      dutyMealBankName: rows[5] || "",
      dutyMealGdriveFolder: rows[6] || "",
      dutyMealGdriveEmail: rows[7] || "",
      dutyMealGdrivePrivateKey: rows[8] ? "***configured***" : "",
      dutyMealMinMonths: rows[9] ? parseInt(rows[9]) : 3,
      dutyMealUnpaidLock: rows[10] || "",
      dutyMealUnpaidMonths: rows[11] ? parseInt(rows[11]) : 2,
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/duty-meal", requireRole("admin"), async (req, res) => {
  try {
    const { dutyMealEnabled, dutyMealCompanyId, dutyMealLockDate,
      dutyMealBankAccountNumber, dutyMealBankAccountName, dutyMealBankName,
      dutyMealGdriveFolder, dutyMealGdriveEmail, dutyMealGdrivePrivateKey,
      dutyMealMinMonths, dutyMealUnpaidLock, dutyMealUnpaidMonths } = req.body;
    if (dutyMealEnabled !== undefined) await upsertSetting("duty_meal_enabled", String(dutyMealEnabled));
    if (dutyMealCompanyId !== undefined) await upsertSetting("duty_meal_company_id", dutyMealCompanyId ? String(dutyMealCompanyId) : "");
    if (dutyMealLockDate !== undefined) await upsertSetting("duty_meal_lock_date", String(dutyMealLockDate));
    if (dutyMealBankAccountNumber !== undefined) await upsertSetting("duty_meal_bank_account_number", dutyMealBankAccountNumber || "");
    if (dutyMealBankAccountName !== undefined) await upsertSetting("duty_meal_bank_account_name", dutyMealBankAccountName || "");
    if (dutyMealBankName !== undefined) await upsertSetting("duty_meal_bank_name", dutyMealBankName || "");
    if (dutyMealGdriveFolder !== undefined) await upsertSetting("duty_meal_gdrive_folder", dutyMealGdriveFolder || "");
    if (dutyMealGdriveEmail !== undefined) await upsertSetting("duty_meal_gdrive_email", dutyMealGdriveEmail || "");
    if (dutyMealGdrivePrivateKey !== undefined && dutyMealGdrivePrivateKey && dutyMealGdrivePrivateKey !== "***configured***") {
      await upsertSetting("duty_meal_gdrive_private_key", dutyMealGdrivePrivateKey);
    }
    if (dutyMealMinMonths !== undefined) await upsertSetting("duty_meal_min_months", String(parseInt(dutyMealMinMonths) || 3));
    if (dutyMealUnpaidLock !== undefined) await upsertSetting("duty_meal_unpaid_lock", dutyMealUnpaidLock || "");
    if (dutyMealUnpaidMonths !== undefined) await upsertSetting("duty_meal_unpaid_months", String(parseInt(dutyMealUnpaidMonths) || 2));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Leave minimum months (global setting — used across all companies)
router.get("/leave-eligibility", async (req, res) => {
  try {
    const val = await getSettingValue("leave_min_months");
    res.json({ leaveMinMonths: val ? parseInt(val) : 3 });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/leave-eligibility", requireRole("admin"), async (req, res) => {
  try {
    const { leaveMinMonths } = req.body;
    if (leaveMinMonths !== undefined) await upsertSetting("leave_min_months", String(parseInt(leaveMinMonths) || 3));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

// Appearance settings
router.get("/appearance", requireRole("admin"), async (req, res) => {
  try {
    const [landingPageImageUrl, landingPageStyle, logoUrl, landingHeading, landingSubtitle, appName] = await Promise.all([
      getSettingValue("landing_page_image_url"),
      getSettingValue("landing_page_style"),
      getSettingValue("logo_url"),
      getSettingValue("landing_heading"),
      getSettingValue("landing_subtitle"),
      getSettingValue("app_name"),
    ]);
    res.json({
      landingPageImageUrl: landingPageImageUrl || "",
      landingPageStyle: landingPageStyle || "image",
      logoUrl: logoUrl || "",
      landingHeading: landingHeading || "",
      landingSubtitle: landingSubtitle || "",
      appName: appName || "",
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

router.put("/appearance", requireRole("admin"), async (req, res) => {
  const { landingPageImageUrl, landingPageStyle, logoUrl, landingHeading, landingSubtitle, appName } = req.body;
  try {
    if (landingPageImageUrl !== undefined) await upsertSetting("landing_page_image_url", landingPageImageUrl || "");
    if (landingPageStyle !== undefined) await upsertSetting("landing_page_style", landingPageStyle || "image");
    if (logoUrl !== undefined) await upsertSetting("logo_url", logoUrl || "");
    if (landingHeading !== undefined) await upsertSetting("landing_heading", landingHeading || "");
    if (landingSubtitle !== undefined) await upsertSetting("landing_subtitle", landingSubtitle || "");
    if (appName !== undefined) await upsertSetting("app_name", appName || "");
    const [url, style, logo, heading, subtitle, name] = await Promise.all([
      getSettingValue("landing_page_image_url"),
      getSettingValue("landing_page_style"),
      getSettingValue("logo_url"),
      getSettingValue("landing_heading"),
      getSettingValue("landing_subtitle"),
      getSettingValue("app_name"),
    ]);
    res.json({
      landingPageImageUrl: url || "",
      landingPageStyle: style || "image",
      logoUrl: logo || "",
      landingHeading: heading || "",
      landingSubtitle: subtitle || "",
      appName: name || "",
    });
  } catch { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
