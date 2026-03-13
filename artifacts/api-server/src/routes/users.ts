import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, ilike, or, count, sql } from "drizzle-orm";
import { hashPassword, requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const offset = (page - 1) * limit;

  try {
    let query = db.select().from(usersTable);
    let countQuery = db.select({ count: count() }).from(usersTable);

    if (search) {
      const searchFilter = or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.username, `%${search}%`),
        ilike(usersTable.department, `%${search}%`)
      );
      query = query.where(searchFilter) as any;
      countQuery = countQuery.where(searchFilter) as any;
    }

    const [users, totalResult] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery,
    ]);

    const superiorIds = users.filter(u => u.superiorId).map(u => u.superiorId!);
    const superiors = superiorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(sql`${usersTable.id} = ANY(${superiorIds})`)
      : [];

    const superiorMap = new Map(superiors.map(s => [s.id, s.name]));
    const usersWithoutPasswords = users.map(({ passwordHash: _, ...u }) => ({
      ...u,
      superiorName: u.superiorId ? superiorMap.get(u.superiorId) || null : null,
    }));

    res.json({
      users: usersWithoutPasswords,
      total: totalResult[0]?.count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { username, password, name, email, department, position, role, superiorId } = req.body;
  if (!username || !password || !name || !department || !position || !role) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" });
    return;
  }
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) {
      res.status(400).json({ error: "Bad Request", message: "Username already exists" });
      return;
    }
    const [user] = await db.insert(usersTable).values({
      username,
      passwordHash: hashPassword(password),
      name,
      email,
      department,
      position,
      role,
      superiorId: superiorId || null,
    }).returning();

    await createAuditLog(req.user!.id, "create_user", "user", user.id, `Created user ${username}`);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json({ ...userWithoutPassword, superiorName: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    let superiorName: string | null = null;
    if (user.superiorId) {
      const [s] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.superiorId));
      superiorName = s?.name || null;
    }
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ ...userWithoutPassword, superiorName });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, department, position, role, superiorId, isActive, password } = req.body;
  try {
    const updateData: any = {
      name, email, department, position, role,
      superiorId: superiorId || null,
      isActive,
      updatedAt: new Date(),
    };
    if (password) {
      updateData.passwordHash = hashPassword(password);
    }
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    await createAuditLog(req.user!.id, "update_user", "user", id);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ ...userWithoutPassword, superiorName: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  try {
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await createAuditLog(req.user!.id, "delete_user", "user", id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
