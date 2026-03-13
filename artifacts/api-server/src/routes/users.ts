import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, userCompaniesTable, companiesTable } from "@workspace/db/schema";
import { eq, ilike, or, count, inArray, sql } from "drizzle-orm";
import { hashPassword, requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();
router.use(requireAuth);

async function getUserCompanies(userIds: number[]) {
  if (userIds.length === 0) return [];
  const assignments = await db.select({
    id: userCompaniesTable.id,
    userId: userCompaniesTable.userId,
    companyId: userCompaniesTable.companyId,
    department: userCompaniesTable.department,
    companyName: companiesTable.name,
  })
    .from(userCompaniesTable)
    .leftJoin(companiesTable, eq(sql`${userCompaniesTable.companyId}::integer`, companiesTable.id))
    .where(inArray(sql`${userCompaniesTable.userId}::integer`, userIds));
  return assignments;
}

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const role = req.query.role as string;
  const offset = (page - 1) * limit;

  try {
    let conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(usersTable.name, `%${search}%`),
        ilike(usersTable.username, `%${search}%`),
        ilike(usersTable.department, `%${search}%`)
      ));
    }
    if (role) conditions.push(eq(usersTable.role, role));

    const whereClause = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`) : undefined;

    let query = db.select().from(usersTable);
    let countQuery = db.select({ count: count() }).from(usersTable);
    if (whereClause) {
      query = query.where(whereClause) as any;
      countQuery = countQuery.where(whereClause) as any;
    }

    const [users, totalResult] = await Promise.all([
      query.limit(limit).offset(offset),
      countQuery,
    ]);

    const userIds = users.map(u => u.id);
    const companies = await getUserCompanies(userIds);
    const companyMap = new Map<number, any[]>();
    for (const c of companies) {
      const uid = parseInt(c.userId);
      if (!companyMap.has(uid)) companyMap.set(uid, []);
      companyMap.get(uid)!.push({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department });
    }

    const superiorIds = users.filter(u => u.superiorId).map(u => u.superiorId!);
    const superiors = superiorIds.length > 0
      ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, superiorIds))
      : [];
    const superiorMap = new Map(superiors.map(s => [s.id, s.name]));

    const result = users.map(({ passwordHash: _, ...u }) => ({
      ...u,
      superiorName: u.superiorId ? superiorMap.get(u.superiorId) || null : null,
      companies: companyMap.get(u.id) || [],
    }));

    res.json({ users: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole("admin"), async (req, res) => {
  const { username, password, name, email, department, position, role, superiorId, companies } = req.body;
  if (!username || !password || !name || !department || !position || !role) {
    res.status(400).json({ error: "Bad Request", message: "Missing required fields" }); return;
  }
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) { res.status(400).json({ error: "Username already exists" }); return; }

    const [user] = await db.insert(usersTable).values({
      username, passwordHash: hashPassword(password), name, email, department, position, role,
      superiorId: superiorId || null,
    }).returning();

    if (companies && Array.isArray(companies) && companies.length > 0) {
      await db.insert(userCompaniesTable).values(
        companies.map((c: any) => ({ userId: String(user.id), companyId: String(c.companyId), department: c.department }))
      );
    }

    await createAuditLog(req.user!.id, "create_user", "user", user.id, `Created user ${username}`);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.status(201).json({ ...userWithoutPassword, superiorName: null, companies: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    let superiorName: string | null = null;
    if (user.superiorId) {
      const [s] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.superiorId));
      superiorName = s?.name || null;
    }
    const companies = await getUserCompanies([id]);
    const { passwordHash: _, ...u } = user;
    res.json({ ...u, superiorName, companies: companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })) });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, email, department, position, role, superiorId, isActive, password, companies } = req.body;
  try {
    const updateData: any = { name, email, department, position, role, superiorId: superiorId || null, isActive, updatedAt: new Date() };
    if (password) updateData.passwordHash = hashPassword(password);
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    if (companies !== undefined) {
      await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
      if (Array.isArray(companies) && companies.length > 0) {
        await db.insert(userCompaniesTable).values(
          companies.map((c: any) => ({ userId: String(id), companyId: String(c.companyId), department: c.department }))
        );
      }
    }

    await createAuditLog(req.user!.id, "update_user", "user", id);
    const userCompanies = await getUserCompanies([id]);
    const { passwordHash: _, ...u } = user;
    res.json({ ...u, superiorName: null, companies: userCompanies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  try {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await createAuditLog(req.user!.id, "delete_user", "user", id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/companies", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const companies = await getUserCompanies([id]);
    res.json(companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/companies", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { assignments } = req.body;
  try {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
    if (Array.isArray(assignments) && assignments.length > 0) {
      await db.insert(userCompaniesTable).values(
        assignments.map((a: any) => ({ userId: String(id), companyId: String(a.companyId), department: a.department }))
      );
    }
    const companies = await getUserCompanies([id]);
    res.json(companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })));
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
