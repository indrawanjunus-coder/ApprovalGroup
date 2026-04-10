import { Router } from "express";
import { db } from "../lib/db.js";
import { db as replitDb } from "@workspace/db";
import { settingsTable, companiesTable, companyLeaveSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import nodemailer from "nodemailer";
import { handleRouteError } from "../lib/audit.js";
import { testNeonConnection, isNeonConfigured, parseNeonUrl, buildNeonUrl, setNeonUrl, getNeonUrl } from "../lib/neonClient.js";
import { syncAllToNeon, syncAll, checkNeonTablesExist, resetNeonSequences } from "../lib/neonSync.js";
import type { SyncDirection, SyncMode } from "../lib/neonSync.js";
import { setPrimaryDb, getPrimaryDb } from "../lib/db.js";
import { invalidateNeonCache, setNeonEnabled } from "../lib/neonDualWrite.js";
import { invalidateGeoCache } from "../lib/geoRestrict.js";
import { getNeonPool } from "../lib/neonClient.js";

/**
 * Write a setting directly to Replit DB (bypassing the proxy).
 * Critical settings (neon_db_enabled, primary_db) must always exist in Replit
 * because the dual-write middleware and server startup read from Replit directly.
 */
async function upsertReplitSetting(key: string, value: string) {
  const existing = await replitDb.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length > 0) {
    await replitDb.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
  } else {
    await replitDb.insert(settingsTable).values({ key, value });
  }
}

/**
 * Write a setting directly to Neon DB (bypassing the proxy).
 * Critical settings must also be written to Neon so that when Neon becomes the
 * active primary, GET /settings/neon reads the correct values.
 */
async function upsertNeonSetting(key: string, value: string) {
  const pool = getNeonPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

/**
 * Read a critical setting from Replit DB directly (bypasses proxy).
 * Always use this for infrastructure settings like primary_db and neon_db_enabled
 * which must remain consistent regardless of which DB is currently active.
 */
async function getReplitSettingValue(key: string): Promise<string> {
  const [setting] = await replitDb.select().from(settingsTable).where(eq(settingsTable.key, key));
  return setting?.value ?? "";
}

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
    const [poEnabled, companyName, currency, featureDutyMeal, featurePembayaran, featurePurchaseRequest, geoRestrictIndonesia, geoIpWhitelist] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
      getSettingValue("feature_duty_meal"),
      getSettingValue("feature_pembayaran"),
      getSettingValue("feature_purchase_request"),
      getSettingValue("geo_restrict_indonesia"),
      getSettingValue("geo_ip_whitelist"),
    ]);
    res.json({
      poEnabled: poEnabled === "true",
      companyName,
      currency,
      featureDutyMeal: featureDutyMeal !== "false",
      featurePembayaran: featurePembayaran !== "false",
      featurePurchaseRequest: featurePurchaseRequest !== "false",
      geoRestrictIndonesia: geoRestrictIndonesia === "true",
      geoIpWhitelist: geoIpWhitelist || "",
    });
  } catch (err) { handleRouteError(res, err); }
});

router.put("/", requireRole("admin"), async (req, res) => {
  const { poEnabled, companyName, currency, featureDutyMeal, featurePembayaran, featurePurchaseRequest, geoRestrictIndonesia, geoIpWhitelist } = req.body;
  try {
    if (poEnabled !== undefined) await upsertSetting("poEnabled", String(poEnabled));
    if (companyName !== undefined) await upsertSetting("companyName", companyName);
    if (currency !== undefined) await upsertSetting("currency", currency);
    if (featureDutyMeal !== undefined) await upsertSetting("feature_duty_meal", String(featureDutyMeal));
    if (featurePembayaran !== undefined) await upsertSetting("feature_pembayaran", String(featurePembayaran));
    if (featurePurchaseRequest !== undefined) await upsertSetting("feature_purchase_request", String(featurePurchaseRequest));
    if (geoRestrictIndonesia !== undefined) {
      await upsertSetting("geo_restrict_indonesia", String(geoRestrictIndonesia));
      invalidateGeoCache();
    }
    if (geoIpWhitelist !== undefined) {
      await upsertSetting("geo_ip_whitelist", geoIpWhitelist);
      invalidateGeoCache();
    }

    const [poEnabledVal, companyNameVal, currencyVal, fdm, fp, fpr, geoRestrict, geoWhitelist] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
      getSettingValue("feature_duty_meal"),
      getSettingValue("feature_pembayaran"),
      getSettingValue("feature_purchase_request"),
      getSettingValue("geo_restrict_indonesia"),
      getSettingValue("geo_ip_whitelist"),
    ]);
    res.json({
      poEnabled: poEnabledVal === "true",
      companyName: companyNameVal,
      currency: currencyVal,
      featureDutyMeal: fdm !== "false",
      featurePembayaran: fp !== "false",
      featurePurchaseRequest: fpr !== "false",
      geoRestrictIndonesia: geoRestrict === "true",
      geoIpWhitelist: geoWhitelist || "",
    });
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

// ─── Neon Database Settings ─────────────────────────────────────────────────

// Get Neon DB config & status
router.get("/neon", requireRole("admin"), async (req, res) => {
  try {
    const configured = isNeonConfigured();
    // Always read primary_db and neon_db_enabled from Replit directly —
    // these are infrastructure settings and Replit is always the source of truth.
    const [neonEnabled, neonUrl, primaryDb] = await Promise.all([
      getReplitSettingValue("neon_db_enabled"),
      getReplitSettingValue("neon_db_url"),
      getReplitSettingValue("primary_db"),
    ]);

    let tableStatus = null;
    if (configured) {
      try {
        tableStatus = await checkNeonTablesExist();
      } catch {}
    }

    // Parse connection info for display (never expose password)
    const effectiveUrl = getNeonUrl();
    const parsed = effectiveUrl ? parseNeonUrl(effectiveUrl) : null;

    res.json({
      configured,
      enabled: neonEnabled === "true",
      primaryDb: (primaryDb as "replit" | "neon") || "replit",
      connectionUrl: neonUrl || (configured ? "[dikonfigurasi via ENV]" : ""),
      hasAllTables: tableStatus?.hasAllTables ?? false,
      missingTables: tableStatus?.missingTables ?? [],
      existingTablesCount: tableStatus?.existingTables?.length ?? 0,
      // Parsed fields (password masked)
      connectionInfo: parsed ? {
        host: parsed.host,
        port: parsed.port,
        user: parsed.user,
        database: parsed.database,
        sslmode: parsed.sslmode,
        hasPassword: !!parsed.password,
      } : null,
      // Is connection from env var (read-only in UI) or from settings (editable)
      connectionSource: neonUrl ? "settings" : (configured ? "env" : "none"),
    });
  } catch (err) { handleRouteError(res, err); }
});

// Update Neon config (enable/disable + primary DB selector)
router.put("/neon", requireRole("admin"), async (req, res) => {
  const { enabled, primaryDb } = req.body;
  try {
    if (enabled !== undefined) {
      const val = String(enabled);
      // Write to BOTH databases so the value is consistent regardless of which is active.
      // Replit is the source of truth for the dual-write middleware and startup.
      // Neon must also have it so GET /settings/neon reads correctly when Neon is primary.
      await Promise.all([
        upsertReplitSetting("neon_db_enabled", val),
        upsertNeonSetting("neon_db_enabled", val),
      ]);
      // Update in-memory cache immediately so middleware sees it without waiting for TTL
      setNeonEnabled(enabled === true || enabled === "true");
    }
    if (primaryDb === "replit" || primaryDb === "neon") {
      // Write to BOTH databases. After switching, the new primary DB must already
      // have primary_db set correctly (so GET reads right value), and Replit must
      // also have it for server restart recovery.
      await Promise.all([
        upsertReplitSetting("primary_db", primaryDb),
        upsertNeonSetting("primary_db", primaryDb),
      ]);
      setPrimaryDb(primaryDb);
      // When switching TO Neon, reset its sequences to prevent duplicate key errors.
      // Neon sequences may be out-of-sync with the data synced from Replit.
      if (primaryDb === "neon") {
        resetNeonSequences().catch(err =>
          console.error("[Neon] Gagal reset sequences:", err.message)
        );
      }
    }
    invalidateNeonCache();
    const configured = isNeonConfigured();
    // Always read from Replit (source of truth)
    const [neonEnabled, savedPrimary] = await Promise.all([
      getReplitSettingValue("neon_db_enabled"),
      getReplitSettingValue("primary_db"),
    ]);
    res.json({ configured, enabled: neonEnabled === "true", primaryDb: savedPrimary || "replit" });
  } catch (err) { handleRouteError(res, err); }
});

// Test Neon connection (existing/current)
router.post("/neon/test", requireRole("admin"), async (req, res) => {
  try {
    const result = await testNeonConnection();
    res.json(result);
  } catch (err) { handleRouteError(res, err); }
});

// Test a specific connection URL before saving
router.post("/neon/test-url", requireRole("admin"), async (req, res) => {
  try {
    const { connectionUrl, host, port, user, password, database, sslmode } = req.body;
    let url = connectionUrl;
    if (!url && host && user && password && database) {
      url = buildNeonUrl({ host, port, user, password, database, sslmode });
    }
    if (!url) return res.status(400).json({ ok: false, message: "URL atau field koneksi harus diisi" });
    const result = await testNeonConnection(url);
    res.json(result);
  } catch (err) { handleRouteError(res, err); }
});

// Update Neon connection credentials
router.put("/neon/connection", requireRole("admin"), async (req, res) => {
  try {
    const { connectionUrl, host, port, user, password, database, sslmode } = req.body;

    let finalUrl = connectionUrl;
    if (!finalUrl) {
      if (!host || !user || !password || !database) {
        return res.status(400).json({ error: "Connection string atau semua field (host, user, password, database) harus diisi" });
      }
      finalUrl = buildNeonUrl({ host, port, user, password, database, sslmode });
    }

    // Validate by testing the connection first
    const testResult = await testNeonConnection(finalUrl);
    if (!testResult.ok) {
      return res.status(400).json({ error: `Koneksi gagal: ${testResult.message}` });
    }

    // Save to settings (both Replit and Neon)
    await upsertReplitSetting("neon_db_url", finalUrl);
    // Try writing to Neon too (if currently connected), ignore errors
    upsertNeonSetting("neon_db_url", finalUrl).catch(() => {});

    // Apply the new URL to the running server
    setNeonUrl(finalUrl);

    // Reset sequences since this might be a new/different Neon DB
    resetNeonSequences().catch(() => {});

    const parsed = parseNeonUrl(finalUrl);
    res.json({
      ok: true,
      message: testResult.message,
      connectionInfo: parsed ? {
        host: parsed.host,
        port: parsed.port,
        user: parsed.user,
        database: parsed.database,
        sslmode: parsed.sslmode,
        hasPassword: !!parsed.password,
      } : null,
      connectionSource: "settings",
      configured: true,
    });
  } catch (err) { handleRouteError(res, err); }
});

// Remove/disconnect Neon connection completely
router.delete("/neon/connection", requireRole("admin"), async (req, res) => {
  try {
    // 1. Remove saved URL from settings table
    await replitDb.delete(settingsTable).where(eq(settingsTable.key, "neon_db_url"));

    // 2. Reset primary DB to Replit and disable dual write
    await Promise.all([
      upsertReplitSetting("primary_db", "replit"),
      upsertReplitSetting("neon_db_enabled", "false"),
    ]);

    // 3. Update in-memory runtime state immediately
    setPrimaryDb("replit");
    setNeonEnabled(false);
    setNeonUrl(null);  // closes pool, clears URL override
    invalidateNeonCache();

    // 4. Check if env var is still set (user must remove it manually)
    const envStillSet = !!process.env.NEON_DATABASE_URL;

    res.json({
      ok: true,
      message: "Koneksi Neon berhasil dihapus. Primary DB dikembalikan ke Replit.",
      envStillSet,
      warning: envStillSet
        ? "NEON_DATABASE_URL masih terdapat di environment variables. Hapus manual dari Secrets agar Neon tidak bisa diakses sama sekali."
        : null,
    });
  } catch (err) { handleRouteError(res, err); }
});

// Sync between databases (SSE streaming progress)
// direction: "replit_to_neon" | "neon_to_replit"
// mode: "upsert_missing" (insert only new rows) | "full_overwrite" (truncate + reinsert)
let syncInProgress = false;
router.post("/neon/sync", requireRole("admin"), async (req, res) => {
  if (syncInProgress) {
    res.status(409).json({ error: "Sinkronisasi sedang berjalan, harap tunggu." });
    return;
  }

  const direction: SyncDirection = (req.body?.direction === "neon_to_replit") ? "neon_to_replit" : "replit_to_neon";
  const rawMode = req.body?.mode;
  const mode: SyncMode = rawMode === "full_overwrite" ? "full_overwrite" : rawMode === "upsert_all" ? "upsert_all" : "upsert_missing";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const dirLabel = direction === "replit_to_neon" ? "Replit → Neon" : "Neon → Replit";
  const modeLabel = mode === "upsert_missing" ? "hanya data baru" : mode === "upsert_all" ? "tambah & perbarui" : "timpa penuh";

  syncInProgress = true;
  try {
    sendEvent({ type: "start", message: `Memulai sinkronisasi ${dirLabel} (${modeLabel})...` });

    const result = await syncAll(direction, mode, (progress) => {
      sendEvent({ type: "progress", ...progress });
    });

    const doneCount = result.results.filter(r => r.status === "done").length;
    const errorCount = result.results.filter(r => r.status === "error").length;
    const totalRows = result.results.reduce((s, r) => s + (r.rows || 0), 0);
    const totalInserted = result.results.reduce((s, r) => s + (r.inserted || 0), 0);
    const totalSkipped = result.results.reduce((s, r) => s + (r.skipped || 0), 0);

    sendEvent({
      type: "complete",
      success: result.success,
      doneCount,
      errorCount,
      totalRows,
      totalInserted,
      totalSkipped,
      direction,
      mode,
      message: result.success
        ? `${dirLabel}: ${doneCount} tabel selesai — ${totalInserted.toLocaleString()} baris ditambahkan, ${totalSkipped.toLocaleString()} dilewati`
        : `Sinkronisasi selesai dengan ${errorCount} error`,
    });
  } catch (err: any) {
    sendEvent({ type: "error", message: err.message || "Error tidak diketahui" });
  } finally {
    syncInProgress = false;
    res.end();
  }
});

// ─── Appearance settings ─────────────────────────────────────────────────────

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
