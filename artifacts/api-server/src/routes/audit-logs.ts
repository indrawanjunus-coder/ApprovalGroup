import { Router } from "express";
import { db } from "@workspace/db";
import { auditLogsTable, usersTable } from "@workspace/db/schema";
import { eq, desc, count, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const prId = req.query.prId ? parseInt(req.query.prId as string) : undefined;
  const offset = (page - 1) * limit;

  try {
    let query = db.select().from(auditLogsTable);
    let countQuery = db.select({ count: count() }).from(auditLogsTable);

    if (prId) {
      query = query.where(eq(auditLogsTable.entityId, prId)) as any;
      countQuery = countQuery.where(eq(auditLogsTable.entityId, prId)) as any;
    }

    const [logs, totalResult] = await Promise.all([
      query.orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
      countQuery,
    ]);

    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = userIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));

    const result = logs.map(l => ({ ...l, userName: userMap.get(l.userId) || "Unknown" }));

    res.json({
      auditLogs: result,
      total: Number(totalResult[0]?.count) || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
