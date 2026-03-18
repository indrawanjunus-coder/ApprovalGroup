import { Router } from "express";
import { db } from "@workspace/db";
import { requireAuth } from "../lib/auth.js";
import { purchaseRequestsTable } from "@workspace/db/schema";
import { usersTable, userCompaniesTable } from "@workspace/db/schema";
import { companiesTable, userLeaveBalancesTable } from "@workspace/db/schema";
import { eq, and, or, ilike, sql, desc, inArray, ne } from "drizzle-orm";

const router = Router();

async function getUserCompanyIds(userId: number): Promise<number[]> {
  const rows = await db.select({ companyId: userCompaniesTable.companyId })
    .from(userCompaniesTable)
    .where(eq(userCompaniesTable.userId, String(userId)));
  return rows.map(r => parseInt(r.companyId)).filter(n => !isNaN(n));
}

router.get("/report", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { year, department, companyId, status, page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const offset = (pageNum - 1) * limitNum;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();

    const conditions: any[] = [eq(purchaseRequestsTable.type, "leave")];
    conditions.push(
      sql`(EXTRACT(YEAR FROM ${purchaseRequestsTable.leaveStartDate}) = ${currentYear} OR EXTRACT(YEAR FROM ${purchaseRequestsTable.createdAt}) = ${currentYear})`
    );
    if (status) conditions.push(eq(purchaseRequestsTable.status, status as string));
    if (department) conditions.push(eq(purchaseRequestsTable.department, department as string));
    if (companyId) conditions.push(eq(purchaseRequestsTable.companyId, parseInt(companyId as string)));

    if (user.role !== "admin") {
      const companyIds = await getUserCompanyIds(user.id);
      const accessConds: any[] = [eq(purchaseRequestsTable.department, user.department)];
      if (companyIds.length > 0) accessConds.push(inArray(purchaseRequestsTable.companyId, companyIds));
      conditions.push(or(...accessConds));
    }

    const [rows, countRows] = await Promise.all([
      db.select({
        id: purchaseRequestsTable.id,
        prNumber: purchaseRequestsTable.prNumber,
        status: purchaseRequestsTable.status,
        description: purchaseRequestsTable.description,
        notes: purchaseRequestsTable.notes,
        department: purchaseRequestsTable.department,
        companyId: purchaseRequestsTable.companyId,
        leaveStartDate: purchaseRequestsTable.leaveStartDate,
        leaveEndDate: purchaseRequestsTable.leaveEndDate,
        leaveRequesterId: purchaseRequestsTable.leaveRequesterId,
        requesterId: purchaseRequestsTable.requesterId,
        createdAt: purchaseRequestsTable.createdAt,
        requesterName: usersTable.name,
        requesterDept: usersTable.department,
        companyName: companiesTable.name,
      })
        .from(purchaseRequestsTable)
        .leftJoin(usersTable, eq(purchaseRequestsTable.requesterId, usersTable.id))
        .leftJoin(companiesTable, eq(purchaseRequestsTable.companyId, companiesTable.id))
        .where(and(...conditions))
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(limitNum)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(purchaseRequestsTable)
        .leftJoin(usersTable, eq(purchaseRequestsTable.requesterId, usersTable.id))
        .leftJoin(companiesTable, eq(purchaseRequestsTable.companyId, companiesTable.id))
        .where(and(...conditions)),
    ]);

    const leaveRequesterIds = [...new Set(rows.filter(r => r.leaveRequesterId).map(r => r.leaveRequesterId!))];
    const leaveRequesterMap = new Map<number, string>();
    if (leaveRequesterIds.length > 0) {
      const lrs = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(inArray(usersTable.id, leaveRequesterIds));
      lrs.forEach(lr => leaveRequesterMap.set(lr.id, lr.name));
    }

    const result = rows.map(r => {
      const start = r.leaveStartDate ? new Date(r.leaveStartDate) : null;
      const end = r.leaveEndDate ? new Date(r.leaveEndDate) : null;
      const days = start && end ? Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1 : null;
      return {
        ...r,
        days,
        leaveRequesterName: r.leaveRequesterId
          ? (leaveRequesterMap.get(r.leaveRequesterId) || r.requesterName)
          : r.requesterName,
      };
    });

    const total = countRows[0]?.count || 0;
    res.json({ data: result, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (e) {
    console.error("leave report error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/balances", requireAuth, async (req, res) => {
  try {
    const user = (req as any).user;
    const { year, department, search, page = "1", limit = "50" } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(200, parseInt(limit as string) || 50);
    const offset = (pageNum - 1) * limitNum;

    const conditions: any[] = [eq(usersTable.isActive, true)];
    if (search) conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.department, `%${search}%`), ilike(usersTable.position, `%${search}%`)));
    if (department) conditions.push(eq(usersTable.department, department as string));

    if (user.role !== "admin") {
      const companyIds = await getUserCompanyIds(user.id);
      const accessConds: any[] = [eq(usersTable.department, user.department)];
      if (companyIds.length > 0) {
        const usersInCompanies = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .innerJoin(
            userCompaniesTable,
            and(
              sql`${userCompaniesTable.userId}::integer = ${usersTable.id}`,
              inArray(userCompaniesTable.companyId, companyIds.map(String))
            )
          );
        const ids = usersInCompanies.map(u => u.id);
        if (ids.length > 0) accessConds.push(inArray(usersTable.id, ids));
      }
      conditions.push(or(...accessConds));
    }

    const [users, countRows] = await Promise.all([
      db.select({
        id: usersTable.id,
        name: usersTable.name,
        username: usersTable.username,
        department: usersTable.department,
        position: usersTable.position,
        hiredCompanyId: usersTable.hiredCompanyId,
        leaveAccrualStartMonth: (usersTable as any).leaveAccrualStartMonth,
      })
        .from(usersTable)
        .where(and(...conditions))
        .orderBy(usersTable.name)
        .limit(limitNum)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(and(...conditions)),
    ]);

    const userIds = users.map(u => u.id);
    let balances: any[] = [];
    if (userIds.length > 0) {
      balances = await db.select()
        .from(userLeaveBalancesTable)
        .where(and(inArray(userLeaveBalancesTable.userId, userIds), eq(userLeaveBalancesTable.year, currentYear)));
    }

    const balanceMap = new Map(balances.map(b => [b.userId, b]));

    const hiredCompanyIds = [...new Set(users.filter(u => u.hiredCompanyId).map(u => u.hiredCompanyId!))];
    const companyMap = new Map<number, string>();
    if (hiredCompanyIds.length > 0) {
      const companies = await db.select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable).where(inArray(companiesTable.id, hiredCompanyIds));
      companies.forEach(c => companyMap.set(c.id, c.name));
    }

    const result = users.map(u => {
      const bal = balanceMap.get(u.id);
      const balDays = bal ? parseFloat(bal.balanceDays) : 0;
      const carryDays = bal ? parseFloat(bal.carriedOverDays) : 0;
      const usedDays = bal ? parseFloat(bal.usedDays) : 0;
      return {
        userId: u.id,
        name: u.name,
        username: u.username,
        department: u.department,
        position: u.position,
        companyName: u.hiredCompanyId ? (companyMap.get(u.hiredCompanyId) || null) : null,
        leaveAccrualStartMonth: (u as any).leaveAccrualStartMonth ?? null,
        year: currentYear,
        balanceDays: balDays,
        carriedOverDays: carryDays,
        usedDays,
        availableDays: Math.max(0, balDays + carryDays - usedDays),
        hasBalance: !!bal,
        balanceId: bal?.id ?? null,
        carriedOverExpiry: bal?.carriedOverExpiry ?? null,
      };
    });

    const total = countRows[0]?.count || 0;
    res.json({ data: result, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (e) {
    console.error("leave balances error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/balances/:userId", requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin") return res.status(403).json({ error: "Admin only" });

  try {
    const userId = parseInt(req.params.userId);
    const { year, balanceDays, carriedOverDays, usedDays, carriedOverExpiry, leaveAccrualStartMonth } = req.body;
    const currentYear = year || new Date().getFullYear();

    // Save leaveAccrualStartMonth to users table if provided
    if (leaveAccrualStartMonth !== undefined) {
      await db.update(usersTable).set({
        leaveAccrualStartMonth: leaveAccrualStartMonth === null ? null : parseInt(leaveAccrualStartMonth),
        updatedAt: new Date(),
      } as any).where(eq(usersTable.id, userId));
    }

    const existing = await db.select().from(userLeaveBalancesTable)
      .where(and(eq(userLeaveBalancesTable.userId, userId), eq(userLeaveBalancesTable.year, currentYear)))
      .limit(1);

    let record;
    if (existing.length > 0) {
      const [updated] = await db.update(userLeaveBalancesTable)
        .set({
          balanceDays: String(balanceDays ?? existing[0].balanceDays),
          carriedOverDays: String(carriedOverDays ?? existing[0].carriedOverDays),
          usedDays: String(usedDays ?? existing[0].usedDays),
          carriedOverExpiry: carriedOverExpiry !== undefined ? carriedOverExpiry : existing[0].carriedOverExpiry,
          updatedAt: new Date(),
        })
        .where(eq(userLeaveBalancesTable.id, existing[0].id))
        .returning();
      record = updated;
    } else {
      const [created] = await db.insert(userLeaveBalancesTable).values({
        userId,
        year: currentYear,
        balanceDays: String(balanceDays ?? 0),
        carriedOverDays: String(carriedOverDays ?? 0),
        usedDays: String(usedDays ?? 0),
        carriedOverExpiry: carriedOverExpiry ?? null,
      }).returning();
      record = created;
    }

    res.json(record);
  } catch (e) {
    console.error("upsert leave balance error:", e);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
