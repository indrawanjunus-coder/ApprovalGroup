import { db } from "@workspace/db";
import { purchaseRequestsTable, purchaseOrdersTable } from "@workspace/db/schema";
import { like } from "drizzle-orm";

export async function generatePRNumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PR-${dateStr}-`;
  
  const existingPRs = await db
    .select({ prNumber: purchaseRequestsTable.prNumber })
    .from(purchaseRequestsTable)
    .where(like(purchaseRequestsTable.prNumber, `${prefix}%`));
  
  const maxSeq = existingPRs.reduce((max, pr) => {
    const seq = parseInt(pr.prNumber.split("-").pop() || "0", 10);
    return Math.max(max, seq);
  }, 0);
  
  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${prefix}${nextSeq}`;
}

export async function generatePONumber(): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PO-${dateStr}-`;
  
  const existingPOs = await db
    .select({ poNumber: purchaseOrdersTable.poNumber })
    .from(purchaseOrdersTable)
    .where(like(purchaseOrdersTable.poNumber, `${prefix}%`));
  
  const maxSeq = existingPOs.reduce((max, po) => {
    const seq = parseInt(po.poNumber.split("-").pop() || "0", 10);
    return Math.max(max, seq);
  }, 0);
  
  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${prefix}${nextSeq}`;
}
