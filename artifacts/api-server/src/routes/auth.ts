import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, requireAuth } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Bad Request", message: "Username and password required" });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid username or password" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ error: "Unauthorized", message: "Account is inactive" });
      return;
    }
    (req.session as any).userId = user.id;
    await createAuditLog(user.id, "login", "user", user.id, `User ${user.username} logged in`);
    const { passwordHash: _, ...userWithoutPassword } = user;
    res.json({ user: { ...userWithoutPassword, superiorName: null }, message: "Login successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  await createAuditLog(userId, "logout", "user", userId);
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out successfully" });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = req.user!;
  let superiorName: string | null = null;
  if (user.superiorId) {
    const [superior] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.superiorId));
    superiorName = superior?.name || null;
  }
  const { passwordHash: _, ...userWithoutPassword } = user;
  res.json({ ...userWithoutPassword, superiorName });
});

export default router;
