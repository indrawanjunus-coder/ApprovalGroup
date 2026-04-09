import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Prevent unhandled 'error' events from crashing the process
// (e.g. when running in production with Neon as primary DB,
//  the Replit DB connection may be terminated externally)
pool.on("error", (err) => {
  console.warn("[Replit DB Pool] Connection error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
