import { db } from "@workspace/db";
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
