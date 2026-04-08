import { Pool } from "pg";
import { getNeonPool } from "./neonClient.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export interface SyncProgress {
  table: string;
  status: "pending" | "creating" | "syncing" | "done" | "error";
  rows?: number;
  error?: string;
}

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

async function createTablesInNeon(neonPool: Pool, onProgress?: (msg: string) => void): Promise<void> {
  // Get schema from Replit DB (pg catalog)
  const replitConnStr = process.env.DATABASE_URL!;
  const replitPool = new Pool({ connectionString: replitConnStr });
  
  try {
    for (const tableName of SYNC_TABLES) {
      onProgress?.(`Memeriksa tabel: ${tableName}`);
      
      // Check if table exists in Neon
      const neonClient = await neonPool.connect();
      try {
        const exists = await neonClient.query(
          `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [tableName]
        );
        
        if (parseInt(exists.rows[0].count) === 0) {
          onProgress?.(`Membuat tabel: ${tableName}`);
          
          // Get CREATE TABLE DDL from Replit
          const replitClient = await replitPool.connect();
          try {
            // Get columns
            const colsResult = await replitClient.query(`
              SELECT 
                c.column_name,
                c.data_type,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                c.is_nullable,
                c.column_default,
                c.udt_name
              FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = $1
              ORDER BY c.ordinal_position
            `, [tableName]);

            if (colsResult.rows.length === 0) continue;

            const colDefs = colsResult.rows.map((col: any) => {
              let typeDef = "";
              const def = col.column_default || "";
              
              // Detect serial (integer with nextval sequence)
              if ((col.data_type === "integer" || col.data_type === "bigint") && def.includes("nextval")) {
                typeDef = col.data_type === "bigint" ? "bigserial" : "serial";
              } else if (col.data_type === "character varying") {
                typeDef = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "text";
              } else if (col.data_type === "character") {
                typeDef = `char(${col.character_maximum_length || 1})`;
              } else if (col.data_type === "numeric") {
                typeDef = col.numeric_precision ? `numeric(${col.numeric_precision},${col.numeric_scale || 0})` : "numeric";
              } else if (col.data_type === "USER-DEFINED") {
                typeDef = col.udt_name; // e.g. enum types
              } else {
                typeDef = col.data_type;
              }
              
              const nullable = col.is_nullable === "YES" ? "" : " NOT NULL";
              const defaultVal = def && !def.includes("nextval") ? ` DEFAULT ${def}` : "";
              
              return `  "${col.column_name}" ${typeDef}${nullable}${defaultVal}`;
            }).join(",\n");

            // Get primary key
            const pkResult = await replitClient.query(`
              SELECT kcu.column_name
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
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

export async function syncAllToNeon(onProgress?: (progress: SyncProgress) => void): Promise<{ success: boolean; results: SyncProgress[]; error?: string }> {
  const neonPool = getNeonPool();
  if (!neonPool) {
    return { success: false, results: [], error: "Neon tidak dikonfigurasi" };
  }

  const results: SyncProgress[] = SYNC_TABLES.map(t => ({ table: t, status: "pending" as const }));

  try {
    // First create tables if they don't exist
    await createTablesInNeon(neonPool, (msg) => console.log("[Neon Sync]", msg));

    for (let i = 0; i < SYNC_TABLES.length; i++) {
      const tableName = SYNC_TABLES[i];
      results[i].status = "syncing";
      onProgress?.(results[i]);

      try {
        const neonClient = await neonPool.connect();
        try {
          // Disable triggers to speed up insert
          await neonClient.query("BEGIN");

          // Fetch all rows from Replit DB
          const rows = await db.execute(sql.raw(`SELECT * FROM "${tableName}"`));
          const rowsArr = Array.isArray(rows) ? rows : (rows as any).rows || [];

          if (rowsArr.length === 0) {
            // Just truncate Neon table
            await neonClient.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
            results[i].rows = 0;
          } else {
            // Clear Neon table and reinsert
            await neonClient.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);

            // Build bulk insert in batches of 500
            const cols = Object.keys(rowsArr[0]);
            const batchSize = 500;
            
            for (let b = 0; b < rowsArr.length; b += batchSize) {
              const batch = rowsArr.slice(b, b + batchSize);
              const values: any[] = [];
              const placeholders = batch.map((row: any, rowIdx: number) => {
                const rowPlaceholders = cols.map((_, colIdx) => {
                  values.push(row[cols[colIdx]] === undefined ? null : row[cols[colIdx]]);
                  return `$${rowIdx * cols.length + colIdx + 1}`;
                });
                return `(${rowPlaceholders.join(", ")})`;
              });

              const colList = cols.map(c => `"${c}"`).join(", ");
              const insertSQL = `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`;
              await neonClient.query(insertSQL, values);
            }

            results[i].rows = rowsArr.length;
          }

          await neonClient.query("COMMIT");
          results[i].status = "done";
        } catch (err: any) {
          await neonClient.query("ROLLBACK").catch(() => {});
          results[i].status = "error";
          results[i].error = err.message;
          console.error(`[Neon Sync] Error syncing ${tableName}:`, err.message);
        } finally {
          neonClient.release();
        }
      } catch (err: any) {
        results[i].status = "error";
        results[i].error = err.message;
      }

      onProgress?.(results[i]);
    }

    const hasError = results.some(r => r.status === "error");
    return { success: !hasError, results };
  } catch (err: any) {
    return { success: false, results, error: err.message };
  }
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

// Lightweight dual-write: replicate raw SQL to Neon async (fire-and-forget)
export function replicateToNeon(query: string, values?: any[]): void {
  const neonPool = getNeonPool();
  if (!neonPool) return;
  
  neonPool.query(query, values).catch(err => {
    console.error("[Neon DualWrite] Error:", err.message, "Query:", query.substring(0, 100));
  });
}

export const SYNC_TABLE_NAMES = SYNC_TABLES;
