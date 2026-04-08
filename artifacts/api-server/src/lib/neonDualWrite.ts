import { Request, Response, NextFunction } from "express";
import { db as replitDb } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { getNeonPool } from "./neonClient.js";
import { getPrimaryDb } from "./db.js";
import { getNeonDrizzle } from "./neonDrizzle.js";
import pg from "pg";

const { Pool } = pg;

// Cache neon_db_enabled to avoid DB call per request
let neonEnabledCache: boolean | null = null;
let neonEnabledCacheAt = 0;
const CACHE_TTL = 30_000; // 30s

async function isNeonWriteEnabled(): Promise<boolean> {
  const now = Date.now();
  if (neonEnabledCache !== null && now - neonEnabledCacheAt < CACHE_TTL) {
    return neonEnabledCache;
  }
  try {
    // Always read setting from Replit to avoid circular dependency
    const [row] = await replitDb.select().from(settingsTable).where(eq(settingsTable.key, "neon_db_enabled"));
    neonEnabledCache = row?.value === "true";
    neonEnabledCacheAt = now;
  } catch {
    neonEnabledCache = false;
  }
  return neonEnabledCache!;
}

export function invalidateNeonCache() {
  neonEnabledCache = null;
}

/**
 * Force-update the in-memory dual write enabled flag.
 * Call this whenever the setting is changed via API so the middleware
 * picks it up immediately without waiting for cache TTL.
 */
export function setNeonEnabled(val: boolean) {
  neonEnabledCache = val;
  neonEnabledCacheAt = Date.now();
}

// Map route prefixes to table names to sync
const ROUTE_TABLE_MAP: Array<{ pattern: RegExp; tables: string[] }> = [
  { pattern: /^\/api\/users/, tables: ["users", "user_companies"] },
  { pattern: /^\/api\/purchase-requests/, tables: ["purchase_requests", "pr_items", "approvals", "pr_vendor_attachments"] },
  { pattern: /^\/api\/purchase-orders/, tables: ["purchase_orders", "po_items"] },
  { pattern: /^\/api\/receiving/, tables: ["pr_receiving_items"] },
  { pattern: /^\/api\/pembayaran/, tables: ["duty_meal_monthly_payments"] },
  { pattern: /^\/api\/settings/, tables: ["settings"] },
  { pattern: /^\/api\/companies/, tables: ["companies"] },
  { pattern: /^\/api\/departments/, tables: ["departments"] },
  { pattern: /^\/api\/pr-types/, tables: ["pr_types"] },
  { pattern: /^\/api\/locations/, tables: ["locations"] },
  { pattern: /^\/api\/master/, tables: ["master_items", "master_uoms"] },
  { pattern: /^\/api\/leave/, tables: ["user_leave_balances"] },
  { pattern: /^\/api\/duty-meal/, tables: ["duty_meals", "duty_meal_monthly_payments", "duty_meal_plafon"] },
  { pattern: /^\/api\/external\/invoices/, tables: ["vendor_invoices", "vendor_invoice_items"] },
  { pattern: /^\/api\/external\/vendors/, tables: ["vendor_companies"] },
  { pattern: /^\/api\/external\/users/, tables: ["external_users"] },
  { pattern: /^\/api\/vendor-bank-requests/, tables: ["vendor_bank_change_requests"] },
  { pattern: /^\/api\/notifications/, tables: ["notifications"] },
  { pattern: /^\/api\/approval-rules/, tables: ["approval_rules", "approval_rule_levels"] },
];

function getTablesForRoute(path: string): string[] {
  for (const { pattern, tables } of ROUTE_TABLE_MAP) {
    if (pattern.test(path)) return tables;
  }
  return [];
}

/**
 * Sync a table from the primary DB to the secondary DB.
 * primary=Replit → read from Replit, write to Neon
 * primary=Neon   → read from Neon, write to Replit
 */
async function syncTableToSecondary(tableName: string): Promise<void> {
  const primary = getPrimaryDb();

  if (primary === "replit") {
    // Replit → Neon
    const neonPool = getNeonPool();
    if (!neonPool) return;

    const rows = await replitDb.execute(sql.raw(`SELECT * FROM "${tableName}"`));
    const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows || [];

    const client = await neonPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
      if (rowsArr.length > 0) {
        const cols = Object.keys(rowsArr[0]);
        const batchSize = 500;
        for (let b = 0; b < rowsArr.length; b += batchSize) {
          const batch = rowsArr.slice(b, b + batchSize);
          const values: any[] = [];
          const placeholders = batch.map((row: any, rowIdx: number) =>
            `(${cols.map((_, ci) => { values.push(row[cols[ci]] ?? null); return `$${rowIdx * cols.length + ci + 1}`; }).join(", ")})`
          );
          await client.query(
            `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
            values
          );
        }
      }
      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } else {
    // Neon → Replit
    const neonDrizzle = getNeonDrizzle();
    const replitConnStr = process.env.DATABASE_URL!;
    const replitPool = new Pool({ connectionString: replitConnStr, max: 2 });

    try {
      const rows = await neonDrizzle.execute(sql.raw(`SELECT * FROM "${tableName}"`));
      const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows || [];

      const client = await replitPool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
        if (rowsArr.length > 0) {
          const cols = Object.keys(rowsArr[0]);
          const batchSize = 500;
          for (let b = 0; b < rowsArr.length; b += batchSize) {
            const batch = rowsArr.slice(b, b + batchSize);
            const values: any[] = [];
            const placeholders = batch.map((row: any, rowIdx: number) =>
              `(${cols.map((_, ci) => { values.push(row[cols[ci]] ?? null); return `$${rowIdx * cols.length + ci + 1}`; }).join(", ")})`
            );
            await client.query(
              `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
              values
            );
          }
        }
        await client.query("COMMIT");
      } catch (err: any) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } finally {
      await replitPool.end();
    }
  }
}

// Express middleware — fires async table sync after successful write responses
export function neonDualWriteMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const path = req.path;
      if (path.includes("/neon/sync") || path.includes("/neon/test") || path.includes("/neon/primary")) return;

      const tables = getTablesForRoute(path);
      if (tables.length === 0) return;

      isNeonWriteEnabled().then(enabled => {
        if (!enabled) return;
        for (const table of tables) {
          syncTableToSecondary(table).catch(err => {
            console.error(`[DualWrite] Failed to sync ${table}:`, err.message);
          });
        }
      }).catch(() => {});
    }
  });

  next();
}
