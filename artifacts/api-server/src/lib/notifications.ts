import { db } from "./db.js";
import { notificationsTable } from "@workspace/db/schema";

export async function createNotification(
  userId: number,
  title: string,
  message: string,
  type: string,
  prId?: number,
  poId?: number
) {
  try {
    await db.insert(notificationsTable).values({
      userId,
      title,
      message,
      type,
      prId,
      poId,
    });
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}
