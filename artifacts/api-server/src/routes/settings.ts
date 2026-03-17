import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable, companiesTable, companyLeaveSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";

const router = Router();
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

router.get("/", async (req, res) => {
  try {
    const [poEnabled, companyName, currency] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
    ]);
    res.json({ poEnabled: poEnabled === "true", companyName, currency });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/", requireRole("admin"), async (req, res) => {
  const { poEnabled, companyName, currency } = req.body;
  try {
    const updates: { key: string; value: string }[] = [];
    if (poEnabled !== undefined) updates.push({ key: "poEnabled", value: String(poEnabled) });
    if (companyName !== undefined) updates.push({ key: "companyName", value: companyName });
    if (currency !== undefined) updates.push({ key: "currency", value: currency });

    for (const { key, value } of updates) {
      const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key));
      if (existing.length > 0) {
        await db.update(settingsTable).set({ value, updatedAt: new Date() }).where(eq(settingsTable.key, key));
      } else {
        await db.insert(settingsTable).values({ key, value });
      }
    }

    const [poEnabledVal, companyNameVal, currencyVal] = await Promise.all([
      getSettingValue("poEnabled"),
      getSettingValue("companyName"),
      getSettingValue("currency"),
    ]);
    res.json({ poEnabled: poEnabledVal === "true", companyName: companyNameVal, currency: currencyVal });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
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
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
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
  } catch (err) { res.status(500).json({ error: "Internal server error" }); }
});

export default router;
