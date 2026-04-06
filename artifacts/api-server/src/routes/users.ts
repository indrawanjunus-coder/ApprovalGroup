import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, userCompaniesTable, companiesTable, userLeaveBalancesTable, companyLeaveSettingsTable, settingsTable } from "@workspace/db/schema";
import { eq, ilike, or, count, inArray, sql, and } from "drizzle-orm";
import { hashPassword, requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog, handleRouteError } from "../lib/audit.js";
import { sendNewUserEmail } from "../lib/email.js";

const router = Router();
router.use(requireAuth);

async function getUserCompanies(userIds: number[]) {
  if (userIds.length === 0) return [];
  return db.select({
    id: userCompaniesTable.id,
    userId: userCompaniesTable.userId,
    companyId: userCompaniesTable.companyId,
    department: userCompaniesTable.department,
    companyName: companiesTable.name,
  })
    .from(userCompaniesTable)
    .leftJoin(companiesTable, eq(sql`${userCompaniesTable.companyId}::integer`, companiesTable.id))
    .where(inArray(sql`${userCompaniesTable.userId}::integer`, userIds));
}

async function getHiredCompanyName(hiredCompanyId: number | null | undefined): Promise<string | null> {
  if (!hiredCompanyId) return null;
  const [c] = await db.select({ name: companiesTable.name }).from(companiesTable).where(eq(companiesTable.id, hiredCompanyId));
  return c?.name || null;
}

router.get("/", async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = req.query.search as string;
  const role = req.query.role as string;
  const offset = (page - 1) * limit;
  try {
    let conditions: any[] = [];
    if (search) conditions.push(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.username, `%${search}%`), ilike(usersTable.department, `%${search}%`)));
    if (role) conditions.push(eq(usersTable.role, role));
    const where = conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;

    const [users, totalResult] = await Promise.all([
      db.select().from(usersTable).where(where).limit(limit).offset(offset),
      db.select({ count: count() }).from(usersTable).where(where),
    ]);

    const userIds = users.map(u => u.id);
    const [allCompanies, companyAssignments] = await Promise.all([
      db.select().from(companiesTable),
      getUserCompanies(userIds),
    ]);
    const companyNameMap = new Map(allCompanies.map(c => [c.id, c.name]));
    const assMap = new Map<number, any[]>();
    for (const c of companyAssignments) {
      const uid = parseInt(c.userId);
      if (!assMap.has(uid)) assMap.set(uid, []);
      assMap.get(uid)!.push({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department });
    }
    const superiorIds = [...new Set(users.filter(u => u.superiorId).map(u => u.superiorId!))];
    const superiors = superiorIds.length > 0 ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, superiorIds)) : [];
    const superiorMap = new Map(superiors.map(s => [s.id, s.name]));

    const result = users.map(({ passwordHash: _, ...u }) => ({
      ...u,
      superiorName: u.superiorId ? (superiorMap.get(u.superiorId) || null) : null,
      hiredCompanyName: u.hiredCompanyId ? (companyNameMap.get(u.hiredCompanyId) || null) : null,
      companies: assMap.get(u.id) || [],
    }));
    res.json({ users: result, total: Number(totalResult[0]?.count) || 0, page, limit });
  } catch (err) { handleRouteError(res, err); }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }
    const { passwordHash: _, ...u } = user;
    const [companies, hiredCompanyName] = await Promise.all([
      getUserCompanies([id]),
      getHiredCompanyName(u.hiredCompanyId),
    ]);
    res.json({ ...u, superiorName: null, hiredCompanyName, companies: companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })) });
  } catch (err) { handleRouteError(res, err); }
});

router.post("/", requireRole("admin", "approver"), async (req, res) => {
  const requester = req.user!;
  const { username, password, name, email, department, position, superiorId, hiredCompanyId, companies, joinDate,
    enableDutyMeal, enablePembayaran, enablePurchaseRequest } = req.body;
  // Approver can only create "user" role; admin can set any role
  const role = requester.role === "approver" ? "user" : (req.body.role || "user");
  if (!username || !password || !name || !department || !position) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }
  const parsedSuperiorId = superiorId ? (parseInt(superiorId) || null) : null;
  const parsedHiredCompanyId = hiredCompanyId ? (parseInt(hiredCompanyId) || null) : null;
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username));
    if (existing.length > 0) { res.status(400).json({ error: "Username already exists" }); return; }
    const [user] = await db.insert(usersTable).values({
      username, passwordHash: hashPassword(password), name, email: email || null,
      department, position, role, superiorId: parsedSuperiorId,
      hiredCompanyId: parsedHiredCompanyId, isActive: true,
      joinDate: joinDate || null,
      enableDutyMeal: enableDutyMeal !== undefined ? Boolean(enableDutyMeal) : true,
      enablePembayaran: enablePembayaran !== undefined ? Boolean(enablePembayaran) : true,
      enablePurchaseRequest: enablePurchaseRequest !== undefined ? Boolean(enablePurchaseRequest) : true,
    } as any).returning();

    if (Array.isArray(companies) && companies.length > 0) {
      const validCompanies = companies.filter((c: any) => c.companyId);
      if (validCompanies.length > 0) {
        await db.insert(userCompaniesTable).values(
          validCompanies.map((c: any) => ({ userId: String(user.id), companyId: String(c.companyId), department: c.department || department }))
        );
      }
    }
    await createAuditLog(req.user!.id, "create_user", "user", user.id);
    if (email) {
      sendNewUserEmail(email, name, username, password).catch(() => {});
    }
    const { passwordHash: __, ...u } = user;
    const userComps = await getUserCompanies([user.id]);
    const hiredCompanyName = await getHiredCompanyName(u.hiredCompanyId);
    res.status(201).json({ ...u, superiorName: null, hiredCompanyName, companies: userComps.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })) });
  } catch (err) { handleRouteError(res, err); }
});

router.put("/:id", requireRole("admin", "approver"), async (req, res) => {
  const requester = req.user!;
  const id = parseInt(req.params.id);
  const { name, email, department, position, superiorId, hiredCompanyId, isActive, password, companies, joinDate,
    enableDutyMeal, enablePembayaran, enablePurchaseRequest } = req.body;
  // Approver can only set role "user" and cannot change password
  const role = requester.role === "approver" ? "user" : (req.body.role || "user");
  const parsedSuperiorId = superiorId ? (parseInt(superiorId) || null) : null;
  const parsedHiredCompanyId = hiredCompanyId !== undefined
    ? (hiredCompanyId ? (parseInt(hiredCompanyId) || null) : null)
    : undefined;
  try {
    const updateData: any = {
      name, email: email || null, department, position, role,
      superiorId: parsedSuperiorId,
      hiredCompanyId: parsedHiredCompanyId,
      joinDate: joinDate !== undefined ? (joinDate || null) : undefined,
      isActive: isActive !== undefined ? isActive : true, updatedAt: new Date(),
    };
    if (enableDutyMeal !== undefined) updateData.enableDutyMeal = Boolean(enableDutyMeal);
    if (enablePembayaran !== undefined) updateData.enablePembayaran = Boolean(enablePembayaran);
    if (enablePurchaseRequest !== undefined) updateData.enablePurchaseRequest = Boolean(enablePurchaseRequest);
    // Only admin can change password
    if (password && requester.role === "admin") updateData.passwordHash = hashPassword(password);
    const [user] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    // Always update companies when provided (even empty array = clear all assignments)
    if (companies !== undefined) {
      await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
      const validCompanies = Array.isArray(companies) ? companies.filter((c: any) => c.companyId) : [];
      if (validCompanies.length > 0) {
        await db.insert(userCompaniesTable).values(
          validCompanies.map((c: any) => ({ userId: String(id), companyId: String(c.companyId), department: c.department || user.department || "" }))
        );
      }
    }
    await createAuditLog(req.user!.id, "update_user", "user", id);
    const { passwordHash: _, ...u } = user;
    const [userComps, hiredCompanyName] = await Promise.all([
      getUserCompanies([id]),
      getHiredCompanyName(u.hiredCompanyId),
    ]);
    res.json({ ...u, superiorName: null, hiredCompanyName, companies: userComps.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })) });
  } catch (err) { handleRouteError(res, err); }
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: "Cannot delete your own account" }); return; }
  try {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
    await db.delete(usersTable).where(eq(usersTable.id, id));
    await createAuditLog(req.user!.id, "delete_user", "user", id);
    res.json({ success: true, message: "User deleted" });
  } catch (err) { handleRouteError(res, err); }
});

router.get("/:id/companies", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const companies = await getUserCompanies([id]);
    res.json(companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })));
  } catch (err) { handleRouteError(res, err); }
});

router.put("/:id/companies", requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { assignments } = req.body;
  try {
    await db.delete(userCompaniesTable).where(eq(userCompaniesTable.userId, String(id)));
    if (Array.isArray(assignments) && assignments.length > 0) {
      const valid = assignments.filter((a: any) => a.companyId);
      if (valid.length > 0) {
        const [user] = await db.select({ department: usersTable.department }).from(usersTable).where(eq(usersTable.id, id));
        await db.insert(userCompaniesTable).values(
          valid.map((a: any) => ({ userId: String(id), companyId: String(a.companyId), department: a.department || user?.department || "" }))
        );
      }
    }
    const companies = await getUserCompanies([id]);
    res.json(companies.map(c => ({ id: c.id, userId: c.userId, companyId: c.companyId, companyName: c.companyName || "", department: c.department })));
  } catch (err) { handleRouteError(res, err); }
});

// Leave balance
router.get("/:id/leave-balance", async (req, res) => {
  const userId = parseInt(req.params.id);
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "Not Found" }); return; }

    let [balance] = await db.select().from(userLeaveBalancesTable)
      .where(and(eq(userLeaveBalancesTable.userId, userId), eq(userLeaveBalancesTable.year, year)));

    const now = new Date();
    const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12;
    const joinDate = (user as any).joinDate ?? null;

    if (!balance) {
      balance = await initLeaveBalance(userId, year, user.hiredCompanyId, joinDate);
    } else {
      balance = await accumulateLeave(balance, currentMonth, user.hiredCompanyId, year, joinDate);
    }

    const available = parseFloat(balance.balanceDays) + parseFloat(balance.carriedOverDays) - parseFloat(balance.usedDays);
    res.json({
      id: balance.id, userId: balance.userId, year: balance.year,
      balanceDays: parseFloat(balance.balanceDays), carriedOverDays: parseFloat(balance.carriedOverDays),
      carriedOverExpiry: balance.carriedOverExpiry || null, usedDays: parseFloat(balance.usedDays),
      availableDays: Math.max(0, available), lastAccumulatedMonth: balance.lastAccumulatedMonth,
      updatedAt: balance.updatedAt?.toISOString(),
    });
  } catch (err) { handleRouteError(res, err); }
});

router.put("/:id/leave-balance", requireRole("admin"), async (req, res) => {
  const userId = parseInt(req.params.id);
  const { year, balanceDays, carriedOverDays, usedDays } = req.body;
  try {
    const existing = await db.select().from(userLeaveBalancesTable)
      .where(and(eq(userLeaveBalancesTable.userId, userId), eq(userLeaveBalancesTable.year, year)));
    let result: any;
    if (existing.length > 0) {
      const update: any = { updatedAt: new Date() };
      if (balanceDays !== undefined) update.balanceDays = String(balanceDays);
      if (carriedOverDays !== undefined) update.carriedOverDays = String(carriedOverDays);
      if (usedDays !== undefined) update.usedDays = String(usedDays);
      [result] = await db.update(userLeaveBalancesTable).set(update).where(eq(userLeaveBalancesTable.id, existing[0].id)).returning();
    } else {
      [result] = await db.insert(userLeaveBalancesTable).values({
        userId, year,
        balanceDays: balanceDays !== undefined ? String(balanceDays) : "0",
        carriedOverDays: carriedOverDays !== undefined ? String(carriedOverDays) : "0",
        usedDays: usedDays !== undefined ? String(usedDays) : "0",
        lastAccumulatedMonth: 0,
      }).returning();
    }
    const available = parseFloat(result.balanceDays) + parseFloat(result.carriedOverDays) - parseFloat(result.usedDays);
    res.json({
      id: result.id, userId: result.userId, year: result.year,
      balanceDays: parseFloat(result.balanceDays), carriedOverDays: parseFloat(result.carriedOverDays),
      carriedOverExpiry: result.carriedOverExpiry || null, usedDays: parseFloat(result.usedDays),
      availableDays: Math.max(0, available), lastAccumulatedMonth: result.lastAccumulatedMonth,
      updatedAt: result.updatedAt?.toISOString(),
    });
  } catch (err) { handleRouteError(res, err); }
});

async function getAccrual(companyId: number): Promise<number> {
  const [s] = await db.select().from(companyLeaveSettingsTable).where(eq(companyLeaveSettingsTable.companyId, companyId));
  return s ? parseFloat(s.accrualDaysPerMonth) : 1;
}

async function getLeaveMinMonths(): Promise<number> {
  const [s] = await db.select().from(settingsTable).where(eq(settingsTable.key, "leave_min_months"));
  return s?.value ? parseInt(s.value) : 3;
}

/**
 * Returns the first month (1-12) from which leave accrues in `year`, based on joinDate + minMonths.
 * Returns null if the employee is not yet eligible in that year.
 * If joinDate is null, eligible from month 1.
 */
function computeLeaveEligibleStartMonth(joinDate: string | null | undefined, minMonths: number, year: number): number | null {
  if (!joinDate) return 1;
  const jd = new Date(joinDate);
  if (isNaN(jd.getTime())) return 1;
  // Add minMonths to joinDate
  const eligDate = new Date(jd.getFullYear(), jd.getMonth() + minMonths, jd.getDate());
  if (eligDate.getFullYear() > year) return null; // not eligible this year
  if (eligDate.getFullYear() < year) return 1;    // eligible since before this year
  return eligDate.getMonth() + 1;                 // eligible this year at this month
}

async function initLeaveBalance(userId: number, year: number, hiredCompanyId: number | null | undefined, joinDate?: string | null) {
  const prevYear = year - 1;
  const [prev] = await db.select().from(userLeaveBalancesTable)
    .where(and(eq(userLeaveBalancesTable.userId, userId), eq(userLeaveBalancesTable.year, prevYear)));

  let carriedOver = 0;
  let carriedOverExpiry: string | null = null;
  if (prev) {
    const prevAvail = parseFloat(prev.balanceDays) - parseFloat(prev.usedDays);
    if (prevAvail > 0 && hiredCompanyId) {
      const [s] = await db.select().from(companyLeaveSettingsTable).where(eq(companyLeaveSettingsTable.companyId, hiredCompanyId));
      const max = s ? s.maxCarryoverDays : 12;
      carriedOver = Math.min(prevAvail, max);
      if (s) carriedOverExpiry = `${year}-${String(s.carryoverExpiryMonth).padStart(2, '0')}-${String(s.carryoverExpiryDay).padStart(2, '0')}`;
    }
  }

  const now = new Date();
  const currentMonth = now.getFullYear() === year ? now.getMonth() + 1 : 12;
  const accrual = hiredCompanyId ? await getAccrual(hiredCompanyId) : 1;

  // Compute eligible start month using joinDate + leave_min_months
  const minMonths = await getLeaveMinMonths();
  const eligibleStart = computeLeaveEligibleStartMonth(joinDate, minMonths, year);
  let earned = 0;
  let lastAccMonth = 0;
  if (eligibleStart !== null) {
    const startMonth = Math.max(eligibleStart, 1);
    const endMonth = Math.min(currentMonth, 12);
    if (endMonth >= startMonth) {
      earned = (endMonth - startMonth + 1) * accrual;
      lastAccMonth = endMonth;
    }
  }

  const [nb] = await db.insert(userLeaveBalancesTable).values({
    userId, year, balanceDays: String(earned),
    carriedOverDays: String(carriedOver),
    carriedOverExpiry: carriedOverExpiry || undefined,
    usedDays: "0", lastAccumulatedMonth: lastAccMonth,
  }).returning();
  return nb;
}

async function accumulateLeave(balance: any, currentMonth: number, hiredCompanyId: number | null | undefined, year: number, joinDate?: string | null) {
  if (balance.lastAccumulatedMonth >= currentMonth) return balance;

  const minMonths = await getLeaveMinMonths();
  const eligibleStart = computeLeaveEligibleStartMonth(joinDate, minMonths, year);
  if (eligibleStart === null) return balance; // not eligible this year

  // Start from whichever is later: after last accumulated month, or eligible start
  const start = Math.max(balance.lastAccumulatedMonth + 1, eligibleStart);
  const end = Math.min(currentMonth, 12);
  if (start > end) return balance;

  const accrual = hiredCompanyId ? await getAccrual(hiredCompanyId) : 1;
  const earned = (end - start + 1) * accrual;
  const newBalance = parseFloat(balance.balanceDays) + earned;
  let newCarriedOver = parseFloat(balance.carriedOverDays);
  if (balance.carriedOverExpiry && new Date() > new Date(balance.carriedOverExpiry)) newCarriedOver = 0;
  const [updated] = await db.update(userLeaveBalancesTable).set({
    balanceDays: String(newBalance), carriedOverDays: String(newCarriedOver),
    lastAccumulatedMonth: end, updatedAt: new Date(),
  }).where(eq(userLeaveBalancesTable.id, balance.id)).returning();
  return updated;
}

export default router;
