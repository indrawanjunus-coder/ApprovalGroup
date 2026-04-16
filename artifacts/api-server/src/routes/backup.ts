import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";
import archiver from "archiver";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);
const router = Router();
const WORKSPACE_DIR = "/home/runner/workspace";

// --- Helpers ---

function ts(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

async function findPgDump(): Promise<string> {
  try {
    const { stdout } = await execAsync("which pg_dump");
    return stdout.trim();
  } catch {
    return "pg_dump";
  }
}

async function getAllTablesData(): Promise<Record<string, { columns: { name: string; type: string }[]; rows: any[][] }>> {
  const tablesResult = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tables = (tablesResult.rows as any[]).map((r) => r.table_name as string);
  const result: Record<string, { columns: { name: string; type: string }[]; rows: any[][] }> = {};

  for (const table of tables) {
    const colsResult = await db.execute(sql.raw(`
      SELECT column_name, udt_name
      FROM information_schema.columns
      WHERE table_name = '${table}' AND table_schema = 'public'
      ORDER BY ordinal_position
    `));
    const columns = (colsResult.rows as any[]).map((r) => ({
      name: r.column_name as string,
      type: r.udt_name as string,
    }));

    const dataResult = await db.execute(sql.raw(`SELECT * FROM "${table}" LIMIT 100000`));
    const rows = (dataResult.rows as any[]).map((row: any) =>
      columns.map((col) => row[col.name])
    );
    result[table] = { columns, rows };
  }
  return result;
}

// MySQL type mapping
function pgToMysqlType(pgType: string): string {
  const map: Record<string, string> = {
    int4: "INT", int8: "BIGINT", int2: "SMALLINT",
    int4serial: "INT AUTO_INCREMENT", serial: "INT AUTO_INCREMENT",
    float4: "FLOAT", float8: "DOUBLE",
    text: "TEXT", varchar: "VARCHAR(255)",
    bpchar: "CHAR(255)", bool: "TINYINT(1)",
    timestamp: "DATETIME", timestamptz: "DATETIME",
    date: "DATE", time: "TIME",
    json: "JSON", jsonb: "JSON",
    uuid: "VARCHAR(36)", numeric: "DECIMAL(20,6)",
    bytea: "BLOB",
  };
  return map[pgType] || "TEXT";
}

// SQL Server type mapping
function pgToSqlServerType(pgType: string): string {
  const map: Record<string, string> = {
    int4: "INT", int8: "BIGINT", int2: "SMALLINT",
    float4: "FLOAT", float8: "FLOAT",
    text: "NVARCHAR(MAX)", varchar: "NVARCHAR(255)",
    bpchar: "NCHAR(255)", bool: "BIT",
    timestamp: "DATETIME2", timestamptz: "DATETIMEOFFSET",
    date: "DATE", time: "TIME",
    json: "NVARCHAR(MAX)", jsonb: "NVARCHAR(MAX)",
    uuid: "UNIQUEIDENTIFIER", numeric: "DECIMAL(20,6)",
    bytea: "VARBINARY(MAX)",
  };
  return map[pgType] || "NVARCHAR(MAX)";
}

function escapeMysqlValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
  if (typeof val === "object") {
    const s = JSON.stringify(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `'${s}'`;
  }
  const s = String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${s}'`;
}

function escapeSqlServerValue(val: any, pgType: string): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === "object") {
    const s = JSON.stringify(val).replace(/'/g, "''");
    return `N'${s}'`;
  }
  if (pgType === "uuid") {
    return `'${val}'`;
  }
  const s = String(val).replace(/'/g, "''");
  return `N'${s}'`;
}

// --- PostgreSQL Backup ---

router.get("/db/postgres", requireAuth, requireRole("admin"), async (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: "DATABASE_URL tidak tersedia" });

  const filename = `procureflow_db_postgres_${ts()}.sql`;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  try {
    const pgDump = await findPgDump();
    const child = spawn(pgDump, ["--no-password", "--clean", "--if-exists", dbUrl]);
    child.stdout.pipe(res);
    child.stderr.on("data", (d) => console.error("[backup:pg_dump]", d.toString()));
    child.on("error", (e) => {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    });
    child.on("close", (code) => {
      if (code !== 0 && !res.headersSent)
        res.status(500).json({ error: `pg_dump exited with code ${code}` });
    });
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// --- MySQL Backup ---

router.get("/db/mysql", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const tablesData = await getAllTablesData();
    const filename = `procureflow_db_mysql_${ts()}.sql`;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const lines: string[] = [];
    lines.push("-- ProcureFlow Database Backup — MySQL Format");
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push("-- Source: PostgreSQL (converted to MySQL-compatible SQL)");
    lines.push("");
    lines.push("SET NAMES utf8mb4;");
    lines.push("SET FOREIGN_KEY_CHECKS=0;");
    lines.push("");

    for (const [table, { columns, rows }] of Object.entries(tablesData)) {
      lines.push(`-- Table: \`${table}\``);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(`CREATE TABLE \`${table}\` (`);
      const colDefs = columns.map((c, i) => {
        const mysqlType = pgToMysqlType(c.type);
        const isLast = i === columns.length - 1;
        return `  \`${c.name}\` ${mysqlType}${isLast ? "" : ","}`;
      });
      lines.push(...colDefs);
      lines.push(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
      lines.push("");

      if (rows.length > 0) {
        const cols = columns.map((c) => `\`${c.name}\``).join(", ");
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const values = chunk
            .map((row) => `(${row.map(escapeMysqlValue).join(", ")})`)
            .join(",\n  ");
          lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
          lines.push(`  ${values};`);
        }
        lines.push("");
      }
    }

    lines.push("SET FOREIGN_KEY_CHECKS=1;");
    res.send(lines.join("\n"));
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// --- SQL Server Backup ---

router.get("/db/sqlserver", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const tablesData = await getAllTablesData();
    const filename = `procureflow_db_sqlserver_${ts()}.sql`;
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const lines: string[] = [];
    lines.push("-- ProcureFlow Database Backup — SQL Server (T-SQL) Format");
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push("-- Source: PostgreSQL (converted to SQL Server T-SQL)");
    lines.push("");
    lines.push("USE ProcureFlow;");
    lines.push("GO");
    lines.push("");

    for (const [table, { columns, rows }] of Object.entries(tablesData)) {
      lines.push(`-- Table: [${table}]`);
      lines.push(`IF OBJECT_ID(N'[dbo].[${table}]', N'U') IS NOT NULL DROP TABLE [dbo].[${table}];`);
      lines.push(`CREATE TABLE [dbo].[${table}] (`);
      const colDefs = columns.map((c, i) => {
        const ssType = pgToSqlServerType(c.type);
        const isLast = i === columns.length - 1;
        return `  [${c.name}] ${ssType}${isLast ? "" : ","}`;
      });
      lines.push(...colDefs);
      lines.push(");");
      lines.push("GO");
      lines.push("");

      if (rows.length > 0) {
        const hasBool = columns.some((c) => c.type === "bool");
        if (hasBool) {
          lines.push(`-- Note: boolean columns converted to BIT (0/1)`);
        }
        const cols = columns.map((c) => `[${c.name}]`).join(", ");
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const values = chunk
            .map(
              (row) =>
                `(${row.map((v, ci) => escapeSqlServerValue(v, columns[ci].type)).join(", ")})`
            )
            .join(",\n  ");
          lines.push(`INSERT INTO [dbo].[${table}] (${cols}) VALUES`);
          lines.push(`  ${values};`);
          lines.push("GO");
        }
        lines.push("");
      }
    }

    res.send(lines.join("\n"));
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// --- App ZIP Backup ---

router.get("/app/zip", requireAuth, requireRole("admin"), (req, res) => {
  const filename = `procureflow_app_${ts()}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (e) => {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  });
  archive.pipe(res);

  archive.glob("**/*", {
    cwd: WORKSPACE_DIR,
    ignore: [
      "**/.git/**",
      "**/node_modules/**",
      "**/.cache/**",
      "**/.pnpm-store/**",
      "**/dist/**",
      "**/build/**",
      "**/.local/skills/**",
      "**/*.log",
      "**/tmp/**",
    ],
    dot: true,
  });

  archive.finalize();
});

// --- GitHub Backup ---

router.post("/app/github", requireAuth, requireRole("admin"), async (req, res) => {
  const { repoUrl, token, branch = "main" } = req.body;
  if (!repoUrl || !token) {
    return res.status(400).json({ error: "repoUrl dan token wajib diisi" });
  }

  try {
    const safeUrl = repoUrl.trim().replace(/^https?:\/\//, "");
    const authUrl = `https://${token.trim()}@${safeUrl}`;

    await execAsync(
      `cd "${WORKSPACE_DIR}" && git config user.email "backup@procureflow.app" && git config user.name "ProcureFlow Backup"`
    );
    await execAsync(`cd "${WORKSPACE_DIR}" && git add -A`);

    const commitMsg = `ProcureFlow Backup: ${new Date().toISOString()}`;
    await execAsync(
      `cd "${WORKSPACE_DIR}" && git commit -m "${commitMsg}" || echo "nothing to commit"`
    );

    await execAsync(
      `cd "${WORKSPACE_DIR}" && git push "${authUrl}" HEAD:${branch} --force`
    );

    res.json({ success: true, message: `Backup berhasil dikirim ke ${repoUrl} (branch: ${branch})` });
  } catch (e: any) {
    const errMsg = (e.message || "").replace(/https?:\/\/[^@]+@/g, "https://***@");
    res.status(500).json({ error: errMsg });
  }
});

// --- Backup Info (table stats) ---

router.get("/info", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        t.table_name,
        (SELECT reltuples::bigint FROM pg_class WHERE relname = t.table_name) AS estimated_rows
      FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `);
    res.json({ tables: result.rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
