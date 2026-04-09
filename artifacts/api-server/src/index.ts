import app from "./app";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { setPrimaryDb } from "./lib/db.js";
import { resetNeonSequences } from "./lib/neonSync.js";
import { setNeonUrl } from "./lib/neonClient.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);

  // AUTO-SWITCH (production only): If NEON_DATABASE_URL is set and running in production,
  // always use Neon as primary so deployments don't crash due to unavailable local DB.
  const isProduction = process.env.NODE_ENV === "production";
  const envNeonUrl = process.env.NEON_DATABASE_URL;
  if (isProduction && envNeonUrl) {
    setNeonUrl(envNeonUrl);
    setPrimaryDb("neon");
    console.log("[DB] Primary database: NEON (auto-production)");
    resetNeonSequences().catch(err =>
      console.warn("[Neon] Sequence reset gagal (tidak kritis):", (err as Error).message)
    );
    return; // Skip reading from local Replit DB
  }

  // Fallback: read saved settings from local Replit DB (development)
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "neon_db_url"));
    const savedUrl = rows[0]?.value;
    if (savedUrl) {
      setNeonUrl(savedUrl);
      console.log("[Neon] URL koneksi dimuat dari pengaturan tersimpan.");
    }
  } catch (err) {
    console.warn("[Neon] Gagal memuat neon_db_url dari DB:", (err as Error).message);
  }

  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "primary_db"));
    const savedPrimary = row?.value;
    if (savedPrimary === "neon") {
      setPrimaryDb("neon");
      console.log("[DB] Primary database: NEON (dari pengaturan tersimpan)");
      resetNeonSequences().catch(err =>
        console.warn("[Neon] Sequence reset gagal (tidak kritis):", (err as Error).message)
      );
    } else {
      console.log("[DB] Primary database: REPLIT (default)");
    }
  } catch (err) {
    console.warn("[DB] Tidak bisa memuat pengaturan primary_db, menggunakan Replit:", (err as Error).message);
  }
});
