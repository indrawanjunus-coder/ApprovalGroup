import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getNeonPool } from "./neonClient.js";
import { sql } from "drizzle-orm";

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
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "neon_db_enabled"));
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

// Map route prefixes to table names to sync
const ROUTE_TABLE_MAP: Array<{ pattern: RegExp; tables: string[] }> = [
  { pattern: /^\/api\/users/, tables: ["users", "user_companies"] },
  { pattern: /^\/api\/purchase-requests/, tables: ["purchase_requests", "pr_items", "pr_approvals"] },
  { pattern: /^\/api\/purchase-orders/, tables: ["purchase_orders", "po_items"] },
  { pattern: /^\/api\/receiving/, tables: ["pr_receiving", "receiving_items"] },
  { pattern: /^\/api\/payment/, tables: ["payments", "payment_pr_links"] },
  { pattern: /^\/api\/settings/, tables: ["settings"] },
  { pattern: /^\/api\/companies/, tables: ["companies"] },
  { pattern: /^\/api\/departments/, tables: ["departments"] },
  { pattern: /^\/api\/pr-types/, tables: ["pr_types"] },
  { pattern: /^\/api\/locations/, tables: ["pr_locations"] },
  { pattern: /^\/api\/master/, tables: ["master_items"] },
  { pattern: /^\/api\/leave/, tables: ["leave_requests", "leave_policies"] },
  { pattern: /^\/api\/duty-meal/, tables: ["duty_meal_periods", "duty_meal_entries", "duty_meal_payments"] },
  { pattern: /^\/api\/external\/invoices/, tables: ["invoices", "invoice_items"] },
  { pattern: /^\/api\/external\/vendors/, tables: ["vendor_companies"] },
  { pattern: /^\/api\/external\/users/, tables: ["external_users"] },
  { pattern: /^\/api\/vendor-bank-requests/, tables: ["vendor_bank_change_requests"] },
  { pattern: /^\/api\/notifications/, tables: ["notifications"] },
];

function getTablesForRoute(path: string): string[] {
  for (const { pattern, tables } of ROUTE_TABLE_MAP) {
    if (pattern.test(path)) return tables;
  }
  return [];
}

async function syncTableToNeon(tableName: string): Promise<void> {
  const neonPool = getNeonPool();
  if (!neonPool) return;

  try {
    // Fetch all rows from Replit
    const rows = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
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
          const placeholders = batch.map((row: any, rowIdx: number) => {
            const rowPH = cols.map((_, colIdx) => {
              values.push(row[cols[colIdx]] ?? null);
              return `$${rowIdx * cols.length + colIdx + 1}`;
            });
            return `(${rowPH.join(", ")})`;
          });
          const colList = cols.map(c => `"${c}"`).join(", ");
          await client.query(
            `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
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
  } catch (err: any) {
    console.error(`[Neon DualWrite] Error syncing table "${tableName}":`, err.message);
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
      // Skip sync endpoint itself to avoid recursion
      if (path.includes("/neon/sync") || path.includes("/neon/test")) return;

      const tables = getTablesForRoute(path);
      if (tables.length === 0) return;

      isNeonWriteEnabled().then(enabled => {
        if (!enabled) return;
        // Fire-and-forget: sync each affected table
        for (const table of tables) {
          syncTableToNeon(table).catch(err => {
            console.error(`[Neon DualWrite] Failed to sync ${table}:`, err.message);
          });
        }
      }).catch(() => {});
    }
  });

  next();
}
