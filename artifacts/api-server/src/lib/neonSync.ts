import { Pool } from "pg";
import { getNeonPool } from "./neonClient.js";
import { db as replitDb } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getNeonDrizzle } from "./neonDrizzle.js";

export interface SyncProgress {
  table: string;
  status: "pending" | "creating" | "syncing" | "done" | "error";
  rows?: number;
  inserted?: number;
  skipped?: number;
  error?: string;
}

export type SyncDirection = "replit_to_neon" | "neon_to_replit";
export type SyncMode = "upsert_missing" | "upsert_all" | "full_overwrite";

// All tables to sync (order matters for FK constraints)
const SYNC_TABLES = [
  "companies",
  "settings",
  "departments",
  "pr_types",
  "master_uoms",
  "brands",
  "users",
  "user_companies",
  "company_leave_settings",
  "duty_meal_plafon",
  "approval_rules",
  "approval_rule_levels",
  "vendor_companies",
  "vendor_bank_change_requests",
  "external_users",
  "master_items",
  "locations",
  "purchase_requests",
  "pr_items",
  "pr_vendor_attachments",
  "approvals",
  "purchase_orders",
  "po_items",
  "pr_receiving_items",
  "duty_meal_company_approvers",
  "duty_meals",
  "duty_meal_monthly_payments",
  "user_leave_balances",
  "vendor_invoices",
  "vendor_invoice_items",
  "audit_logs",
  "notifications",
];

// Ensure tables exist in Neon (copy schema from Replit)
async function ensureTablesInNeon(neonPool: Pool, onProgress?: (msg: string) => void): Promise<void> {
  const replitConnStr = process.env.DATABASE_URL!;
  const replitPool = new Pool({ connectionString: replitConnStr, max: 2 });

  try {
    for (const tableName of SYNC_TABLES) {
      onProgress?.(`Memeriksa tabel: ${tableName}`);

      const neonClient = await neonPool.connect();
      try {
        const exists = await neonClient.query(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [tableName]
        );

        if (parseInt(exists.rows[0].count) === 0) {
          onProgress?.(`Membuat tabel: ${tableName}`);

          const replitClient = await replitPool.connect();
          try {
            const colsResult = await replitClient.query(`
              SELECT column_name, data_type, character_maximum_length, numeric_precision,
                     numeric_scale, is_nullable, column_default, udt_name
              FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1
              ORDER BY ordinal_position
            `, [tableName]);

            if (colsResult.rows.length === 0) continue;

            const colDefs = colsResult.rows.map((col: any) => {
              let typeDef = "";
              const def = col.column_default || "";
              if ((col.data_type === "integer" || col.data_type === "bigint") && def.includes("nextval")) {
                typeDef = col.data_type === "bigint" ? "bigserial" : "serial";
              } else if (col.data_type === "character varying") {
                typeDef = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "text";
              } else if (col.data_type === "character") {
                typeDef = `char(${col.character_maximum_length || 1})`;
              } else if (col.data_type === "numeric") {
                typeDef = col.numeric_precision ? `numeric(${col.numeric_precision},${col.numeric_scale || 0})` : "numeric";
              } else if (col.data_type === "USER-DEFINED") {
                typeDef = col.udt_name;
              } else {
                typeDef = col.data_type;
              }
              const nullable = col.is_nullable === "YES" ? "" : " NOT NULL";
              const defaultVal = def && !def.includes("nextval") ? ` DEFAULT ${def}` : "";
              return `  "${col.column_name}" ${typeDef}${nullable}${defaultVal}`;
            }).join(",\n");

            const pkResult = await replitClient.query(`
              SELECT kcu.column_name
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
              WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
              ORDER BY kcu.ordinal_position
            `, [tableName]);

            const pkCols = pkResult.rows.map((r: any) => `"${r.column_name}"`).join(", ");
            const pkConstraint = pkCols ? `,\n  PRIMARY KEY (${pkCols})` : "";
            const createSQL = `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${colDefs}${pkConstraint}\n)`;
            await neonClient.query(createSQL);
          } finally {
            replitClient.release();
          }
        }
      } finally {
        neonClient.release();
      }
    }
  } finally {
    await replitPool.end();
  }
}

/**
 * Get rows from source as plain objects
 */
async function getSourceRows(tableName: string, direction: SyncDirection): Promise<any[]> {
  if (direction === "replit_to_neon") {
    const result = await replitDb.execute(sql.raw(`SELECT * FROM "${tableName}"`));
    return Array.isArray(result) ? result : (result as any).rows || [];
  } else {
    // neon_to_replit: read from Neon
    const neonDrizzle = getNeonDrizzle();
    const result = await neonDrizzle.execute(sql.raw(`SELECT * FROM "${tableName}"`));
    return Array.isArray(result) ? result : (result as any).rows || [];
  }
}

/**
 * Get existing PKs in destination to calculate skipped count
 */
async function getDestPks(
  tableName: string,
  pkCols: string[],
  direction: SyncDirection,
  destPool: Pool
): Promise<Set<string>> {
  const colList = pkCols.map(c => `"${c}"`).join(", ");
  let rows: any[];
  if (direction === "neon_to_replit") {
    // destination = Replit
    const client = await destPool.connect();
    try {
      const r = await client.query(`SELECT ${colList} FROM "${tableName}"`);
      rows = r.rows;
    } finally {
      client.release();
    }
  } else {
    // destination = Neon (already have neonPool)
    const client = await destPool.connect();
    try {
      const r = await client.query(`SELECT ${colList} FROM "${tableName}"`);
      rows = r.rows;
    } finally {
      client.release();
    }
  }
  return new Set(rows.map(r => pkCols.map(c => String(r[c] ?? "")).join("|")));
}

/**
 * Get primary key columns for a table from Replit (source of truth for schema)
 */
async function getPkColumns(tableName: string): Promise<string[]> {
  const replitConnStr = process.env.DATABASE_URL!;
  const pool = new Pool({ connectionString: replitConnStr, max: 2 });
  try {
    const client = await pool.connect();
    try {
      const r = await client.query(`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position
      `, [tableName]);
      return r.rows.map((row: any) => row.column_name);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/**
 * Insert rows into destination, skipping existing ones (INSERT ON CONFLICT DO NOTHING)
 */
async function insertMissingRows(
  tableName: string,
  rows: any[],
  destPool: Pool
): Promise<{ inserted: number; total: number }> {
  if (rows.length === 0) return { inserted: 0, total: 0 };

  const cols = Object.keys(rows[0]);
  const batchSize = 500;
  let totalInserted = 0;

  const client = await destPool.connect();
  try {
    await client.query("BEGIN");

    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      const values: any[] = [];
      const placeholders = batch.map((row: any, rowIdx: number) =>
        `(${cols.map((_, ci) => {
          values.push(row[cols[ci]] ?? null);
          return `$${rowIdx * cols.length + ci + 1}`;
        }).join(", ")})`
      );
      const colList = cols.map(c => `"${c}"`).join(", ");
      const result = await client.query(
        `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
        values
      );
      totalInserted += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return { inserted: totalInserted, total: rows.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upsert all rows: INSERT ... ON CONFLICT (pk) DO UPDATE SET all non-pk columns
 * Inserts new rows AND updates changed rows.
 */
async function upsertAllRows(
  tableName: string,
  rows: any[],
  destPool: Pool
): Promise<{ inserted: number; total: number }> {
  if (rows.length === 0) return { inserted: 0, total: 0 };

  const pkCols = await getPkColumns(tableName);
  if (pkCols.length === 0) {
    // No PK found — fall back to insert-missing
    return insertMissingRows(tableName, rows, destPool);
  }

  const cols = Object.keys(rows[0]);
  const nonPkCols = cols.filter(c => !pkCols.includes(c));
  const conflictCols = pkCols.map(c => `"${c}"`).join(", ");
  const colList = cols.map(c => `"${c}"`).join(", ");

  let upsertSuffix: string;
  if (nonPkCols.length === 0) {
    upsertSuffix = `ON CONFLICT (${conflictCols}) DO NOTHING`;
  } else {
    const updateSet = nonPkCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(", ");
    upsertSuffix = `ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateSet}`;
  }

  const batchSize = 500;
  let totalUpserted = 0;
  const client = await destPool.connect();
  try {
    await client.query("BEGIN");
    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      const values: any[] = [];
      const placeholders = batch.map((row: any, rowIdx: number) =>
        `(${cols.map((_, ci) => {
          values.push(row[cols[ci]] ?? null);
          return `$${rowIdx * cols.length + ci + 1}`;
        }).join(", ")})`
      );
      const result = await client.query(
        `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(", ")} ${upsertSuffix}`,
        values
      );
      totalUpserted += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return { inserted: totalUpserted, total: rows.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Full overwrite: TRUNCATE destination then INSERT all source rows
 */
async function fullOverwrite(
  tableName: string,
  rows: any[],
  destPool: Pool
): Promise<{ inserted: number; total: number }> {
  const client = await destPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);

    if (rows.length === 0) {
      await client.query("COMMIT");
      return { inserted: 0, total: 0 };
    }

    const cols = Object.keys(rows[0]);
    const batchSize = 500;
    let totalInserted = 0;

    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      const values: any[] = [];
      const placeholders = batch.map((row: any, rowIdx: number) =>
        `(${cols.map((_, ci) => {
          values.push(row[cols[ci]] ?? null);
          return `$${rowIdx * cols.length + ci + 1}`;
        }).join(", ")})`
      );
      const colList = cols.map(c => `"${c}"`).join(", ");
      const result = await client.query(
        `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
        values
      );
      totalInserted += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    return { inserted: totalInserted, total: rows.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function syncAll(
  direction: SyncDirection = "replit_to_neon",
  mode: SyncMode = "upsert_missing",
  onProgress?: (progress: SyncProgress) => void
): Promise<{ success: boolean; results: SyncProgress[]; error?: string }> {
  const neonPool = getNeonPool();
  if (!neonPool) {
    return { success: false, results: [], error: "Neon tidak dikonfigurasi" };
  }

  const results: SyncProgress[] = SYNC_TABLES.map(t => ({ table: t, status: "pending" as const }));

  // Destination pool
  let destPool: Pool;
  if (direction === "replit_to_neon") {
    destPool = neonPool;
    // Ensure tables exist in Neon
    await ensureTablesInNeon(neonPool, (msg) => console.log("[Neon Sync]", msg));
  } else {
    // neon_to_replit: destination is Replit
    destPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 5 });
  }

  try {
    // For neon_to_replit, iterate tables in reverse order to avoid FK issues on full overwrite
    const tablesToSync = direction === "neon_to_replit" && mode === "full_overwrite"
      ? [...SYNC_TABLES].reverse()
      : SYNC_TABLES;

    for (let i = 0; i < tablesToSync.length; i++) {
      const tableName = tablesToSync[i];
      const resultIdx = SYNC_TABLES.indexOf(tableName);

      results[resultIdx].status = "syncing";
      onProgress?.(results[resultIdx]);

      try {
        const sourceRows = await getSourceRows(tableName, direction);

        let syncResult: { inserted: number; total: number };
        if (mode === "full_overwrite") {
          syncResult = await fullOverwrite(tableName, sourceRows, destPool);
        } else if (mode === "upsert_all") {
          syncResult = await upsertAllRows(tableName, sourceRows, destPool);
        } else {
          syncResult = await insertMissingRows(tableName, sourceRows, destPool);
        }

        results[resultIdx].rows = syncResult.total;
        results[resultIdx].inserted = syncResult.inserted;
        results[resultIdx].skipped = syncResult.total - syncResult.inserted;
        results[resultIdx].status = "done";
      } catch (err: any) {
        results[resultIdx].status = "error";
        results[resultIdx].error = err.message;
        console.error(`[Sync] Error on ${tableName}:`, err.message);
      }

      onProgress?.(results[resultIdx]);
    }

    const hasError = results.some(r => r.status === "error");
    return { success: !hasError, results };
  } finally {
    if (direction === "neon_to_replit") {
      await (destPool as Pool).end();
    }
  }
}

// Backward compat — kept for existing callers
export async function syncAllToNeon(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ success: boolean; results: SyncProgress[]; error?: string }> {
  return syncAll("replit_to_neon", "full_overwrite", onProgress);
}

export async function checkNeonTablesExist(): Promise<{ hasAllTables: boolean; missingTables: string[]; existingTables: string[] }> {
  const neonPool = getNeonPool();
  if (!neonPool) {
    return { hasAllTables: false, missingTables: SYNC_TABLES, existingTables: [] };
  }

  const client = await neonPool.connect();
  try {
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const existingTables = result.rows.map((r: any) => r.table_name);
    const missingTables = SYNC_TABLES.filter(t => !existingTables.includes(t));
    return { hasAllTables: missingTables.length === 0, missingTables, existingTables };
  } finally {
    client.release();
  }
}

export function replicateToNeon(query: string, values?: any[]): void {
  const neonPool = getNeonPool();
  if (!neonPool) return;
  neonPool.query(query, values).catch(err => {
    console.error("[Neon DualWrite] Error:", err.message, "Query:", query.substring(0, 100));
  });
}

export const SYNC_TABLE_NAMES = SYNC_TABLES;

/**
 * Reset all PostgreSQL sequences in Neon DB to match the current MAX(id) of each table.
 * Must be called after syncing data to Neon, or when switching Neon to primary,
 * to prevent duplicate primary key errors.
 */
export async function resetNeonSequences(): Promise<void> {
  const pool = getNeonPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    // Get all sequences linked to 'id' columns in public schema
    const seqResult = await client.query(`
      SELECT
        seq.relname AS seq_name,
        tbl.relname AS table_name
      FROM pg_class seq
      JOIN pg_depend dep ON dep.objid = seq.oid
      JOIN pg_class tbl ON tbl.oid = dep.refobjid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE seq.relkind = 'S'
        AND ns.nspname = 'public'
    `);

    for (const row of seqResult.rows) {
      try {
        const tableName = row.table_name;
        // Get max id from the table
        const maxRes = await client.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM "${tableName}"`);
        const maxId = parseInt(maxRes.rows[0].max_id, 10);
        if (maxId > 0) {
          await client.query(`SELECT setval('${row.seq_name}', $1)`, [maxId]);
        }
      } catch {
        // Table might not have 'id' column — ignore
      }
    }
    console.log("[Neon] Sequences reset to match MAX(id) values.");
  } finally {
    client.release();
  }
}
