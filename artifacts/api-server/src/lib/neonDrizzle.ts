import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";

const { Pool } = pg;

let _neonPool: InstanceType<typeof Pool> | null = null;
let _neonDb: ReturnType<typeof drizzle> | null = null;

export function getNeonDrizzle(): ReturnType<typeof drizzle> {
  const url = process.env.NEON_DATABASE_URL;
  if (!url) throw new Error("NEON_DATABASE_URL tidak dikonfigurasi");
  if (!_neonDb) {
    _neonPool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 });
    _neonPool.on("error", (err) => console.error("[Neon Drizzle] Pool error:", err));
    _neonDb = drizzle(_neonPool, { schema });
  }
  return _neonDb;
}

export function resetNeonDrizzle() {
  _neonDb = null;
  _neonPool?.end().catch(() => {});
  _neonPool = null;
}
