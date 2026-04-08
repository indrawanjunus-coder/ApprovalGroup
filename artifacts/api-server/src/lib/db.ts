/**
 * Dynamic database proxy.
 * Routes all Drizzle operations to either Replit DB or Neon DB
 * based on the current primary DB setting.
 *
 * Modes:
 *  - "replit" (default): only Replit DB used
 *  - "neon": only Neon DB used
 *  - Dual Write on: primary writes + async secondary writes (handled by neonDualWrite middleware)
 */
import { db as replitDb } from "@workspace/db";
import { getNeonDrizzle } from "./neonDrizzle.js";

export type PrimaryDb = "replit" | "neon";

let _primary: PrimaryDb = "replit";

export function setPrimaryDb(p: PrimaryDb) {
  _primary = p;
  console.log(`[DB] Primary database switched to: ${p.toUpperCase()}`);
}

export function getPrimaryDb(): PrimaryDb {
  return _primary;
}

function getActiveDb() {
  if (_primary === "neon") {
    try {
      return getNeonDrizzle();
    } catch (err) {
      console.error("[DB] Failed to get Neon DB, falling back to Replit:", err);
      return replitDb;
    }
  }
  return replitDb;
}

/**
 * Dynamic DB proxy — all Drizzle calls transparently route to the active primary DB.
 * Drop-in replacement for `import { db } from "@workspace/db"`.
 */
export const db = new Proxy({} as typeof replitDb, {
  get(_target, prop: string) {
    const activeDb = getActiveDb();
    const val = (activeDb as any)[prop];
    if (typeof val === "function") {
      return (...args: any[]) => (activeDb as any)[prop](...args);
    }
    return val;
  },
});
