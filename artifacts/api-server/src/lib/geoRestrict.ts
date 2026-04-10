import type { Request, Response, NextFunction } from "express";
import geoip from "geoip-lite";
import { db } from "./db.js";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

interface GeoConfig {
  enabled: boolean;
  whitelist: string[];
  fetchedAt: number;
}

let cache: GeoConfig | null = null;
const CACHE_TTL_MS = 60_000; // refresh every 60 seconds

async function loadConfig(): Promise<GeoConfig> {
  try {
    const rows = await db
      .select()
      .from(settingsTable)
      .where(
        eq(settingsTable.key, "geo_restrict_indonesia")
      );
    const whitelistRows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, "geo_ip_whitelist"));

    const enabled = rows[0]?.value === "true";
    const rawList = whitelistRows[0]?.value || "";
    const whitelist = rawList
      .split(/[\n,]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);

    return { enabled, whitelist, fetchedAt: Date.now() };
  } catch {
    return { enabled: false, whitelist: [], fetchedAt: Date.now() };
  }
}

function isPrivateIp(ip: string): boolean {
  const cleaned = ip.replace(/^::ffff:/, "");
  if (cleaned === "::1" || cleaned === "127.0.0.1" || cleaned === "localhost") return true;
  const parts = cleaned.split(".").map(Number);
  if (parts.length !== 4) return true; // IPv6 non-mapped = local/private
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  return false;
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
    if (first) return first;
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp;
  return req.ip || req.socket?.remoteAddress || "";
}

export async function geoRestrictMiddleware(req: Request, res: Response, next: NextFunction) {
  // Bypass for health check
  if (req.path === "/health") return next();

  // Refresh cache if stale
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    cache = await loadConfig();
  }

  if (!cache.enabled) return next();

  const clientIp = extractClientIp(req);

  // Always allow private/local IPs
  if (!clientIp || isPrivateIp(clientIp)) return next();

  // Check whitelist
  if (cache.whitelist.includes(clientIp)) return next();

  // Geo-lookup
  const geo = geoip.lookup(clientIp);
  const country = geo?.country || "";

  if (country !== "ID") {
    return res.status(403).json({
      error: "Akses ditolak. Sistem hanya dapat diakses dari wilayah Indonesia.",
      country: country || "Unknown",
    });
  }

  return next();
}

/** Force-clear the in-memory cache so the next request reloads from DB */
export function invalidateGeoCache() {
  cache = null;
}
