import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
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

export default router;
