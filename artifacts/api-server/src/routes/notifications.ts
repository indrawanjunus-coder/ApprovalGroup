import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = req.user!;
  const unreadOnly = req.query.unread === "true";

  try {
    let conditions: any[] = [eq(notificationsTable.userId, user.id)];
    if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [notifications, unreadResult] = await Promise.all([
      db.select().from(notificationsTable).where(whereClause).orderBy(desc(notificationsTable.createdAt)).limit(50),
      db.select({ count: count() }).from(notificationsTable).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false))),
    ]);

    res.json({
      notifications,
      unreadCount: Number(unreadResult[0]?.count) || 0,
      total: notifications.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/read", async (req, res) => {
  const user = req.user!;
  const id = parseInt(req.params.id);
  try {
    const [notification] = await db.update(notificationsTable).set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, user.id)))
      .returning();
    if (!notification) { res.status(404).json({ error: "Not Found" }); return; }
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/read-all", async (req, res) => {
  const user = req.user!;
  try {
    await db.update(notificationsTable).set({ isRead: true }).where(and(eq(notificationsTable.userId, user.id), eq(notificationsTable.isRead, false)));
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
