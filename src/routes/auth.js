import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import dotenv from "dotenv";
dotenv.config();
const prisma = new PrismaClient();
const router = express.Router();

function genToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Faltan campos" });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Usuario no encontrado" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ message: "Contraseña incorrecta" });
  res.json({ token: genToken(user), user });
});

router.post("/logout", authenticate, async (_, res) =>
  res.json({ success: true, message: "Logged out successfully" })
);

router.get("/me", authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json(user);
});

router.put("/me", authenticate, async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: req.body,
  });
  res.json(updated);
});

export default router;
