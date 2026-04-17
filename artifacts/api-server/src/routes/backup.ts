import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { sql } from "drizzle-orm";
import archiver from "archiver";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const router = Router();
const WORKSPACE_DIR = "/home/runner/workspace";

// --- File scanner for App backup ---

const IGNORE_DIR_NAMES = new Set([
  ".git", "node_modules", ".cache", ".pnpm-store",
  "dist", "build", ".local", "tmp", ".turbo",
]);
const IGNORE_FILE_EXTS = new Set([".log", ".lock"]);

function getAllFilesForBackup(dir: string): { relPath: string; fullPath: string }[] {
  const results: { relPath: string; fullPath: string }[] = [];
  function recurse(cur: string) {
    let items: fs.Dirent[];
    try { items = fs.readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const item of items) {
      // Skip known large/irrelevant directories at ANY depth
      if (item.isDirectory()) {
        if (!IGNORE_DIR_NAMES.has(item.name)) recurse(path.join(cur, item.name));
        continue;
      }
      if (!item.isFile()) continue;
      if (IGNORE_FILE_EXTS.has(path.extname(item.name))) continue;
      const full = path.join(cur, item.name);
      const rel = path.relative(dir, full);
      results.push({ relPath: rel, fullPath: full });
    }
  }
  recurse(dir);
  return results;
}

// --- GitHub Git Data API — push multiple files in a single commit ---

async function githubApiPushTree(opts: {
  token: string;
  repoUrl: string;
  branch: string;
  files: { path: string; content: Buffer | string }[];
  commitMsg: string;
  onProgress?: (done: number, total: number) => void;
}) {
  const { token, repoUrl, branch, files, commitMsg, onProgress } = opts;
  const match = repoUrl.replace(/\.git$/, "").match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) throw new Error("Format URL GitHub tidak valid. Contoh: https://github.com/username/repo.git");
  const [, owner, repo] = match;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "ProcureFlow-Backup/1.0",
  };
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  // 1. Get current branch tip (may not exist yet)
  let baseCommitSha: string | undefined;
  let baseTreeSha: string | undefined;
  const refResp = await fetch(`${apiBase}/git/refs/heads/${branch}`, { headers });
  if (refResp.ok) {
    const refData = await refResp.json() as any;
    baseCommitSha = refData.object?.sha;
    const cResp = await fetch(`${apiBase}/git/commits/${baseCommitSha}`, { headers });
    if (cResp.ok) baseTreeSha = ((await cResp.json()) as any).tree?.sha;
  }

  // 2. Verify credentials with a quick check before processing all files
  const testResp = await fetch(`${apiBase}`, { headers });
  if (testResp.status === 401) throw new Error("Token GitHub tidak valid atau sudah kadaluarsa. Pastikan PAT memiliki scope 'repo'.");
  if (testResp.status === 404) throw new Error(`Repository tidak ditemukan: ${repoUrl}. Pastikan repo sudah dibuat dan token memiliki akses.`);

  // 3. Create blobs in parallel batches (skip files > 10 MB)
  const treeItems: any[] = [];
  const BATCH = 10;
  const validFiles = files.filter(f => {
    const buf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content as string, "utf8");
    return buf.length <= 10 * 1024 * 1024;
  });
  let done = 0;
  for (let i = 0; i < validFiles.length; i += BATCH) {
    const batch = validFiles.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const buf = Buffer.isBuffer(file.content)
          ? file.content
          : Buffer.from(file.content as string, "utf8");
        const b64 = buf.toString("base64");
        const bResp = await fetch(`${apiBase}/git/blobs`, {
          method: "POST", headers, body: JSON.stringify({ content: b64, encoding: "base64" }),
        });
        if (!bResp.ok) return null;
        const bData = await bResp.json() as any;
        return { path: file.path, mode: "100644", type: "blob", sha: bData.sha };
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) treeItems.push(r.value);
    }
    done += batch.length;
    onProgress?.(done, validFiles.length);
  }

  if (treeItems.length === 0) throw new Error("Tidak ada file yang berhasil diupload. Periksa token dan akses repository.");

  // 3. Create tree
  const treeBody: any = { tree: treeItems };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  const tResp = await fetch(`${apiBase}/git/trees`, {
    method: "POST", headers, body: JSON.stringify(treeBody),
  });
  if (!tResp.ok) { const e = await tResp.json() as any; throw new Error(`GitHub trees API: ${e.message}`); }
  const treeData = await tResp.json() as any;

  // 4. Create commit
  const commitBody: any = { message: commitMsg, tree: treeData.sha };
  if (baseCommitSha) commitBody.parents = [baseCommitSha];
  const cResp = await fetch(`${apiBase}/git/commits`, {
    method: "POST", headers, body: JSON.stringify(commitBody),
  });
  if (!cResp.ok) { const e = await cResp.json() as any; throw new Error(`GitHub commits API: ${e.message}`); }
  const newCommit = await cResp.json() as any;

  // 5. Update / create branch ref
  const patchResp = await fetch(`${apiBase}/git/refs/heads/${branch}`, {
    method: "PATCH", headers, body: JSON.stringify({ sha: newCommit.sha, force: true }),
  });
  if (!patchResp.ok) {
    // Branch may not exist yet — create it
    const postResp = await fetch(`${apiBase}/git/refs`, {
      method: "POST", headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommit.sha }),
    });
    if (!postResp.ok) { const e = await postResp.json() as any; throw new Error(`GitHub refs API: ${e.message}`); }
  }
  return { commit: newCommit.sha, files: treeItems.length };
}

// --- GitHub API helper (works everywhere, no git required) ---

async function githubApiPutFile(opts: {
  token: string;
  repoUrl: string;
  branch: string;
  filePath: string;
  content: Buffer | string;
  commitMsg: string;
}) {
  const { token, repoUrl, branch, filePath, content, commitMsg } = opts;
  const match = repoUrl.replace(/\.git$/, "").match(/github\.com[/:]([^/]+)\/([^/]+)$/);
  if (!match) throw new Error("Format URL GitHub tidak valid. Contoh: https://github.com/username/repo.git");
  const [, owner, repo] = match;

  const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "ProcureFlow-Backup/1.0",
  };

  // Get existing SHA if file exists (needed for update)
  let sha: string | undefined;
  const getResp = await fetch(`${apiBase}?ref=${branch}`, { headers });
  if (getResp.ok) {
    const existing = await getResp.json() as any;
    sha = existing.sha;
  }

  const b64 = Buffer.isBuffer(content)
    ? content.toString("base64")
    : Buffer.from(content as string, "utf8").toString("base64");

  const body: any = { message: commitMsg, content: b64, branch };
  if (sha) body.sha = sha;

  const putResp = await fetch(apiBase, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!putResp.ok) {
    const err = await putResp.json().catch(() => ({})) as any;
    throw new Error(err.message || `GitHub API error: ${putResp.status} ${putResp.statusText}`);
  }
  return putResp.json();
}

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

// --- Dump Generators (return string/buffer, reusable for GitHub push) ---

async function buildMysqlDump(): Promise<string> {
  const tablesData = await getAllTablesData();
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
  return lines.join("\n");
}

async function buildSqlServerDump(): Promise<string> {
  const tablesData = await getAllTablesData();
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
  return lines.join("\n");
}

async function buildPostgresDump(): Promise<Buffer> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL tidak tersedia");
  const pgDump = await findPgDump();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(pgDump, ["--no-password", "--clean", "--if-exists", dbUrl]);
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => console.error("[backup:pg_dump]", d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`pg_dump exited with code ${code}`));
      resolve(Buffer.concat(chunks));
    });
  });
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

// --- Database GitHub Backup (via GitHub REST API — works in all environments) ---

router.post("/db/github", requireAuth, requireRole("admin"), async (req, res) => {
  const { format, repoUrl, token, branch = "main" } = req.body;
  const validFormats = ["postgres", "mysql", "sqlserver"];
  if (!format || !validFormats.includes(format)) {
    return res.status(400).json({ error: "Format harus: postgres, mysql, atau sqlserver" });
  }
  if (!repoUrl || !token) {
    return res.status(400).json({ error: "repoUrl dan token wajib diisi" });
  }

  try {
    // Generate dump content
    let content: string | Buffer;
    let filename: string;
    if (format === "postgres") {
      content = await buildPostgresDump();
      filename = "db_postgres.sql";
    } else if (format === "mysql") {
      content = await buildMysqlDump();
      filename = "db_mysql.sql";
    } else {
      content = await buildSqlServerDump();
      filename = "db_sqlserver.sql";
    }

    const ghFilePath = `backup/${filename}`;
    const commitMsg = `DB Backup [${format.toUpperCase()}]: ${new Date().toISOString()}`;

    // Push README to backup/ first (creates folder if not exists in repo)
    try {
      await githubApiPutFile({
        token, repoUrl, branch,
        filePath: "backup/README.md",
        content: "# ProcureFlow Database Backups\n\nFolder ini berisi file backup database yang di-push otomatis oleh sistem ProcureFlow.\n",
        commitMsg: "chore: init backup folder",
      });
    } catch {
      // README already exists — ok to ignore
    }

    // Push the SQL file via GitHub API
    await githubApiPutFile({ token, repoUrl, branch, filePath: ghFilePath, content, commitMsg });

    res.json({
      success: true,
      message: `Backup database (${format.toUpperCase()}) berhasil dikirim ke ${repoUrl} — file: ${ghFilePath} (branch: ${branch})`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- App GitHub Backup (via GitHub Git Data API — works in all environments) ---

router.post("/app/github", requireAuth, requireRole("admin"), async (req, res) => {
  const { repoUrl, token, branch = "main" } = req.body;
  if (!repoUrl || !token) {
    return res.status(400).json({ error: "repoUrl dan token wajib diisi" });
  }

  try {
    // Validate GitHub URL early before heavy work
    if (!repoUrl.match(/^https?:\/\/github\.com\/[^/]+\/[^/]+/)) {
      return res.status(400).json({ error: "Format URL GitHub tidak valid. Contoh: https://github.com/username/repo.git" });
    }

    // Scan workspace for files to back up
    const allFiles = getAllFilesForBackup(WORKSPACE_DIR);

    const filesToPush = allFiles
      .map(({ relPath, fullPath }) => {
        try {
          const content = fs.readFileSync(fullPath);
          return { path: relPath.replace(/\\/g, "/"), content };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { path: string; content: Buffer }[];

    if (filesToPush.length === 0) {
      return res.status(400).json({ error: "Tidak ada file yang ditemukan untuk di-backup." });
    }

    const commitMsg = `ProcureFlow App Backup: ${new Date().toISOString()}`;
    const result = await githubApiPushTree({
      token, repoUrl, branch,
      files: filesToPush,
      commitMsg,
    });

    res.json({
      success: true,
      message: `Backup aplikasi berhasil: ${result.files} file dikirim ke ${repoUrl} (branch: ${branch}, commit: ${result.commit.slice(0, 7)})`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
