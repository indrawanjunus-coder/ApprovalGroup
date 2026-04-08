import { Pool } from "pg";

let neonPool: Pool | null = null;

export function getNeonPool(): Pool | null {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) return null;
  if (!neonPool) {
    neonPool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000 });
    neonPool.on("error", (err) => console.error("[Neon] Pool error:", err));
  }
  return neonPool;
}

export async function testNeonConnection(): Promise<{ ok: boolean; message: string }> {
  const pool = getNeonPool();
  if (!pool) return { ok: false, message: "NEON_DATABASE_URL tidak dikonfigurasi" };
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT current_database(), version()");
    client.release();
    const db = result.rows[0]?.current_database;
    const ver = result.rows[0]?.version?.split(" ").slice(0, 2).join(" ");
    return { ok: true, message: `Terhubung ke database "${db}" (${ver})` };
  } catch (err: any) {
    return { ok: false, message: err.message || "Gagal terhubung ke Neon" };
  }
}

export function isNeonConfigured(): boolean {
  return !!process.env.NEON_DATABASE_URL;
}
