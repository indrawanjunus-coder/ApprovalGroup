import { Response } from "express";
import { db } from "./db.js";
import { auditLogsTable } from "@workspace/db/schema";

export async function createAuditLog(
  userId: number,
  action: string,
  entityType: string,
  entityId: number,
  details?: string
) {
  try {
    await db.insert(auditLogsTable).values({
      userId,
      action,
      entityType,
      entityId,
      details,
    });
  } catch (err) {
    console.error("Failed to create audit log:", err);
  }
}

export function handleRouteError(res: Response, err: unknown) {
  console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ error: message });
}
