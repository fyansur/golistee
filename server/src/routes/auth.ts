import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { auth } from "../lib/middleware.js";

const router = Router();

router.get("/me", auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: (req as any).userId },
    select: { id: true, email: true, createdAt: true },
  });
  res.json(user);
});

router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({ data: { email, passwordHash } });
    res.json({ token: signToken(user.id) });
  } catch {
    res.status(400).json({ error: "Email already exists" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ token: signToken(user.id) });
});

router.put("/password", auth, async (req, res) => {
  const userId = (req as any).userId;
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  res.json({ ok: true });
});

export default router;