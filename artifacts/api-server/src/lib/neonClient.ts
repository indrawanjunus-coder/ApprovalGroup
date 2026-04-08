import { Pool } from "pg";

let neonPool: Pool | null = null;
// Runtime-overridable connection URL (takes priority over env var)
let _runtimeNeonUrl: string | null = null;

/** Get the effective Neon connection URL: runtime override → env var */
export function getNeonUrl(): string | null {
  return _runtimeNeonUrl || process.env.NEON_DATABASE_URL || null;
}

/** Update the Neon connection URL at runtime and destroy the existing pool */
export function setNeonUrl(url: string | null) {
  _runtimeNeonUrl = url;
  // Destroy existing pool so the next getNeonPool() creates a fresh one
  if (neonPool) {
    neonPool.end().catch(() => {});
    neonPool = null;
  }
  console.log("[Neon] Connection URL updated, pool reset.");
}

export function getNeonPool(): Pool | null {
  const url = getNeonUrl();
  if (!url) return null;
  if (!neonPool) {
    neonPool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000 });
    neonPool.on("error", (err) => console.error("[Neon] Pool error:", err));
  }
  return neonPool;
}

export async function testNeonConnection(urlOverride?: string): Promise<{
  ok: boolean;
  message: string;
  dbName?: string;
  host?: string;
  user?: string;
}> {
  const url = urlOverride || getNeonUrl();
  if (!url) return { ok: false, message: "URL koneksi Neon belum dikonfigurasi" };

  // Use a temporary pool for testing (doesn't affect the global pool)
  const tempPool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 });
  try {
    const client = await tempPool.connect();
    const result = await client.query(
      "SELECT current_database() AS db, current_user AS usr, inet_server_addr() AS host, version() AS ver"
    );
    client.release();
    const row = result.rows[0];
    const ver = row?.ver?.split(" ").slice(0, 2).join(" ");
    return {
      ok: true,
      message: `Terhubung ke "${row?.db}" sebagai "${row?.usr}" (${ver})`,
      dbName: row?.db,
      host: row?.host,
      user: row?.usr,
    };
  } catch (err: any) {
    return { ok: false, message: err.message || "Gagal terhubung ke Neon" };
  } finally {
    await tempPool.end().catch(() => {});
  }
}

export function isNeonConfigured(): boolean {
  return !!getNeonUrl();
}

/**
 * Parse a Postgres connection string into its components.
 * Returns null if parsing fails.
 */
export function parseNeonUrl(url: string): {
  host: string; port: string; user: string; password: string; database: string; sslmode: string;
} | null {
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: u.port || "5432",
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      sslmode: u.searchParams.get("sslmode") || "require",
    };
  } catch {
    return null;
  }
}

/**
 * Build a Postgres connection string from components.
 */
export function buildNeonUrl(opts: {
  host: string; port?: string; user: string; password: string; database: string; sslmode?: string;
}): string {
  const port = opts.port || "5432";
  const ssl = opts.sslmode || "require";
  const user = encodeURIComponent(opts.user);
  const pass = encodeURIComponent(opts.password);
  return `postgresql://${user}:${pass}@${opts.host}:${port}/${opts.database}?sslmode=${ssl}`;
}
